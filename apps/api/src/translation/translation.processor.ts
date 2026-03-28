import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { ClaudeService } from './claude.service';
import { TranslationService } from './translation.service';
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
  ) {}

  onModuleInit() {
    try {
      this.worker = new Worker(
        TRANSLATION_QUEUE,
        async (job: Job<TranslationJobData>) => {
          await this.processTranslation(job);
        },
        {
          connection: getRedisConnection(),
          concurrency: 1,
        },
      );

      this.worker.on('failed', (job, err) => {
        this.logger.error(`Translation job ${job?.id} failed: ${err.message}`);
      });

      this.worker.on('completed', (job) => {
        this.logger.log(`Translation job ${job.id} completed`);
      });
    } catch {
      this.logger.warn('Translation worker not started — Redis may be unavailable');
    }
  }

  private async processTranslation(job: Job<TranslationJobData>) {
    const { translationId, bookId } = job.data;

    // Get chapter count and metadata (without loading content)
    const chapterMeta = await this.prisma.chapter.findMany({
      where: { bookId },
      orderBy: { number: 'asc' },
      select: { id: true, number: true },
    });

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

    let totalTokens = 0;
    let previousSummary: string | undefined;
    const totalChapters = chapterMeta.length;

    for (let i = 0; i < totalChapters; i++) {
      const meta = chapterMeta[i];

      // Load chapter content one at a time to avoid memory bloat
      const chapter = await this.prisma.chapter.findUnique({
        where: { id: meta.id },
      });

      if (!chapter) continue;

      try {
        // Translate chapter
        const result = await this.claude.translateChapter(chapter.originalContent, {
          bookTitle: book.title,
          chapterNumber: chapter.number,
          totalChapters,
          glossary,
          previousSummary,
        });

        totalTokens += result.tokensUsed;

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

        // Update progress
        const progress = Math.round(((i + 1) / totalChapters) * 100);
        await this.translationService.updateProgress(translationId, progress);

        // Update total tokens
        await this.prisma.translation.update({
          where: { id: translationId },
          data: { totalTokensUsed: totalTokens, aiModel: this.claude.getModel() },
        });

        // Update job progress for BullMQ
        await job.updateProgress(progress);
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
  }
}
