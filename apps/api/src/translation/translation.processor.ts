import { Injectable, OnModuleInit } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { ClaudeService } from './claude.service';
import { TranslationService } from './translation.service';

interface TranslationJobData {
  translationId: string;
  bookId: string;
}

const TRANSLATION_QUEUE = 'translation';

@Injectable()
export class TranslationProcessor implements OnModuleInit {
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
          connection: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
          },
          concurrency: 1, // One translation at a time
        },
      );

      this.worker.on('failed', (job, err) => {
        console.error(`Translation job ${job?.id} failed:`, err.message);
      });

      this.worker.on('completed', (job) => {
        console.log(`Translation job ${job.id} completed`);
      });
    } catch {
      console.warn('⚠️  Translation worker not started — Redis may be unavailable');
    }
  }

  private async processTranslation(job: Job<TranslationJobData>) {
    const { translationId, bookId } = job.data;

    // Get chapters
    const chapters = await this.prisma.chapter.findMany({
      where: { bookId },
      orderBy: { number: 'asc' },
    });

    if (chapters.length === 0) {
      await this.translationService.updateProgress(translationId, 0, 'FAILED');
      throw new Error('No chapters found for book');
    }

    // Get book info
    const book = await this.prisma.book.findUnique({ where: { id: bookId } });
    if (!book) {
      await this.translationService.updateProgress(translationId, 0, 'FAILED');
      throw new Error('Book not found');
    }

    // Get existing glossary
    const translation = await this.prisma.translation.findUnique({
      where: { id: translationId },
    });
    const glossary = (translation?.glossary as Record<string, string>) || {};

    // Mark as in progress
    await this.translationService.updateProgress(translationId, 0, 'IN_PROGRESS');

    let totalTokens = 0;
    let previousSummary: string | undefined;

    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];

      try {
        // Translate chapter
        const result = await this.claude.translateChapter(chapter.originalContent, {
          bookTitle: book.title,
          chapterNumber: chapter.number,
          totalChapters: chapters.length,
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
        const progress = Math.round(((i + 1) / chapters.length) * 100);
        await this.translationService.updateProgress(translationId, progress);

        // Update total tokens
        await this.prisma.translation.update({
          where: { id: translationId },
          data: { totalTokensUsed: totalTokens, aiModel: this.claude['model'] },
        });

        // Update job progress for BullMQ
        await job.updateProgress(progress);
      } catch (error) {
        console.error(`Failed to translate chapter ${chapter.number}:`, error);

        await this.prisma.translation.update({
          where: { id: translationId },
          data: {
            status: 'FAILED',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          },
        });

        throw error;
      }
    }

    // Mark as completed
    await this.translationService.updateProgress(translationId, 100, 'COMPLETED');
  }
}
