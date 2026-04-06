import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { ClaudeService } from './claude.service';
import { TranslationService } from './translation.service';
import { NotificationService } from '../notification/notification.service';
import { TRANSLATION_QUEUE, getRedisConnection } from './translation.constants';

interface TranslationJobData {
  translationId: string;
  bookId: string;
}

@Injectable()
export class TranslationProcessor implements OnModuleInit {
  private readonly logger = new Logger(TranslationProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly claude: ClaudeService,
    private readonly translationService: TranslationService,
    private readonly notificationService: NotificationService,
  ) {}

  onModuleInit() {
    try {
      const redisConn = getRedisConnection();
      this.logger.log(`Starting BullMQ Worker — Redis at ${redisConn.host}:${redisConn.port}, queue: "${TRANSLATION_QUEUE}"`);

      this.worker = new Worker(
        TRANSLATION_QUEUE,
        async (job: Job<TranslationJobData>) => {
          this.logger.log(`📖 Processing translation job ${job.id}: translationId=${job.data.translationId}`);
          await this.processTranslation(job);
        },
        {
          connection: redisConn,
          concurrency: 1,
          stalledInterval: 300000, // 5 minutes — translation takes long
          lockDuration: 600000,   // 10 minutes lock
        },
      );

      this.worker.on('ready', () => {
        this.logger.log('✅ Translation Worker is READY and listening for jobs');
      });

      this.worker.on('failed', (job, err) => {
        this.logger.error(`❌ Translation job ${job?.id} FAILED: ${err.message}\n${err.stack}`);
      });

      this.worker.on('completed', (job) => {
        this.logger.log(`✅ Translation job ${job.id} COMPLETED`);
      });

      this.worker.on('error', (err) => {
        this.logger.error(`❌ Worker error: ${err.message}`);
      });
    } catch (err) {
      this.logger.error(`❌ Translation worker init FAILED: ${err instanceof Error ? err.stack : err}`);
    }
  }

  private async processTranslation(job: Job<TranslationJobData>) {
    const { translationId, bookId } = job.data;
    this.logger.log(`🔄 Starting translation: translationId=${translationId}, bookId=${bookId}`);

    // Get chapter count and metadata (without loading content)
    const chapterMeta = await this.prisma.chapter.findMany({
      where: { bookId },
      orderBy: { number: 'asc' },
      select: { id: true, number: true },
    });

    this.logger.log(`Found ${chapterMeta.length} chapters for book ${bookId}`);

    if (chapterMeta.length === 0) {
      await this.translationService.updateProgress(translationId, 0, 'FAILED');
      throw new Error('No chapters found for book');
    }

    // Get book info and translation glossary in parallel
    const [book, translation] = await Promise.all([
      this.prisma.book.findUnique({ where: { id: bookId } }),
      this.prisma.translation.findUnique({ where: { id: translationId } }),
    ]);

    if (!book) {
      await this.translationService.updateProgress(translationId, 0, 'FAILED');
      throw new Error('Book not found');
    }

    const glossary = (translation?.glossary as Record<string, string>) || {};

    // Mark as in progress
    await this.translationService.updateProgress(translationId, 0, 'IN_PROGRESS');

    // Pre-scan all chapters to estimate total chunks for granular progress
    const chapterContents: { meta: (typeof chapterMeta)[0]; chapter: { id: string; number: number; originalContent: string } }[] = [];
    let totalChunks = 0;

    for (const meta of chapterMeta) {
      const chapter = await this.prisma.chapter.findUnique({ where: { id: meta.id } });
      if (!chapter) continue;
      const chunkCount = this.claude.estimateChunkCount(chapter.originalContent.length);
      totalChunks += chunkCount;
      chapterContents.push({ meta, chapter });
    }

    this.logger.log(`Total estimated chunks across all chapters: ${totalChunks}`);

    let totalTokens = 0;
    let previousSummary: string | undefined;
    let completedChunks = 0;
    const totalChapters = chapterContents.length;

    for (let i = 0; i < totalChapters; i++) {
      const { chapter } = chapterContents[i];

      try {
        this.logger.log(`📝 Translating chapter ${chapter.number}/${totalChapters} (${chapter.originalContent.length} chars)...`);
        // Translate chapter with chunk-level progress callback
        const result = await this.claude.translateChapter(chapter.originalContent, {
          bookTitle: book.title,
          chapterNumber: chapter.number,
          totalChapters,
          glossary,
          previousSummary,
          onChunkComplete: async () => {
            completedChunks++;
            const progress = Math.min(Math.round((completedChunks / totalChunks) * 100), 99);
            await this.translationService.updateProgress(translationId, progress);
            await job.updateProgress(progress);
          },
        });

        totalTokens += result.tokensUsed;
        this.logger.log(`✅ Chapter ${chapter.number} translated (${result.tokensUsed} tokens, ${result.translatedText.length} chars)`);

        // Save translated chapter
        await this.translationService.saveTranslatedChapter(
          translationId,
          chapter.id,
          result.translatedText,
        );

        // Save to S3
        const s3Key = this.s3.generateTranslationKey(bookId, translationId, chapter.number);
        await this.s3.upload(s3Key, Buffer.from(result.translatedText, 'utf-8'), 'text/plain');

        // Generate summary for context continuity
        previousSummary = await this.claude.generateChapterSummary(result.translatedText);

        // Update total tokens
        await this.prisma.translation.update({
          where: { id: translationId },
          data: { totalTokensUsed: totalTokens, aiModel: this.claude.getModel() },
        });
      } catch (error) {
        this.logger.error(`Failed to translate chapter ${chapter.number}: ${error instanceof Error ? error.message : 'Unknown error'}`);

        await this.prisma.translation.update({
          where: { id: translationId },
          data: {
            status: 'FAILED',
            errorMessage: error instanceof Error ? error.message : 'Translation failed',
          },
        });

        throw error;
      }
    }

    // Mark as completed
    await this.translationService.updateProgress(translationId, 100, 'COMPLETED');

    // Send notification
    try {
      const completedTranslation = await this.prisma.translation.findUnique({
        where: { id: translationId },
        include: { book: { include: { userBooks: { select: { userId: true } } } } },
      });
      if (completedTranslation) {
        const userIds = [...new Set(completedTranslation.book.userBooks.map(ub => ub.userId))];
        for (const uid of userIds) {
          await this.notificationService.notify({
            userId: uid,
            type: 'TRANSLATION_COMPLETED',
            titleKa: 'თარგმანი დასრულდა',
            titleEn: 'Translation Completed',
            bodyKa: `„${completedTranslation.book.title}" — თარგმანი მზადაა`,
            bodyEn: `"${completedTranslation.book.title}" — translation is ready`,
            data: { bookId, translationId, bookTitle: completedTranslation.book.title },
          });
        }
      }
    } catch (err) {
      this.logger.error(`Notification failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}
