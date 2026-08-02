import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ClaudeService } from '../translation/claude.service';
import { TranslationService } from '../translation/translation.service';
import { slicePreviewText } from './preview.slice';
import {
  PREVIEW_QUEUE,
  getRedisConnection,
  PREVIEW_WORD_COUNT,
  PREVIEW_MIN_CHAPTER_WORDS,
} from './preview.constants';

export interface PreviewJobData {
  previewId: string;
  bookId: string;
  targetLanguage: string;
}

@Injectable()
export class PreviewProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PreviewProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
    private readonly translationService: TranslationService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    try {
      const redisConn = getRedisConnection();
      this.worker = new Worker(
        PREVIEW_QUEUE,
        async (job: Job<PreviewJobData>) => this.processPreview(job),
        {
          connection: redisConn,
          // Kept low: the translation worker (1) and TTS worker share this
          // process, so total outbound Claude concurrency stays bounded.
          concurrency: parseInt(this.config.get<string>('PREVIEW_MAX_CONCURRENT_JOBS') || '2', 10),
          stalledInterval: 60000,
          lockDuration: 300000,
        },
      );

      this.worker.on('ready', () => this.logger.log('✅ Preview Worker is READY'));
      this.worker.on('failed', (job, err) =>
        this.logger.error(`❌ Preview job ${job?.id} FAILED: ${err.message}`),
      );
      this.worker.on('error', (err) => this.logger.error(`Preview Worker error: ${err.message}`));
    } catch (err) {
      this.logger.error(`Preview worker init FAILED: ${err instanceof Error ? err.stack : err}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.logger.log('Preview Worker closed');
    }
  }

  private async processPreview(job: Job<PreviewJobData>): Promise<void> {
    const { previewId, bookId } = job.data;

    const preview = await this.prisma.bookPreview.findUnique({ where: { id: previewId } });
    if (!preview) {
      this.logger.warn(`Preview ${previewId} no longer exists — skipping`);
      return;
    }
    // Replay safety: a re-delivered job must not re-spend tokens.
    if (preview.status === 'COMPLETED') {
      this.logger.log(`Preview ${previewId} already completed — skipping`);
      return;
    }

    try {
      await this.prisma.bookPreview.update({
        where: { id: previewId },
        data: { status: 'IN_PROGRESS', startedAt: new Date(), errorMessage: null },
      });

      const book = await this.prisma.book.findUnique({
        where: { id: bookId },
        select: {
          id: true,
          title: true,
          originalFileUrl: true,
          originalFormat: true,
          _count: { select: { chapters: true } },
        },
      });
      if (!book) throw new Error('Book not found');

      // Warm the chapters if this is the first time anyone has touched the book.
      // Doubles as prep for the eventual paid translation.
      if (book._count.chapters === 0) {
        if (!book.originalFileUrl) throw new Error('Book file is not available');
        await this.translationService.parseAndSaveChapters(
          book.id,
          book.originalFileUrl,
          book.originalFormat || 'PDF',
        );
      }

      const chapter = await this.pickChapter(bookId);
      if (!chapter) throw new Error('Book has no readable chapters');

      const slice = slicePreviewText(chapter.originalContent, PREVIEW_WORD_COUNT);
      if (!slice.text) throw new Error('Chapter has no text to preview');

      this.logger.log(
        `Preview ${previewId}: chapter ${chapter.number}, ${slice.wordCount} words, ${slice.text.length} chars`,
      );

      // editorPass is deliberately off — a preview must never read better than
      // the tier the user goes on to buy (STANDARD gets no editor pass).
      const result = await this.claude.translateChapter(slice.text, {
        bookTitle: book.title,
        chapterNumber: 1,
        totalChapters: 1,
        editorPass: false,
      });

      await this.prisma.bookPreview.update({
        where: { id: previewId },
        data: {
          status: 'COMPLETED',
          content: result.translatedText,
          sourceText: slice.text,
          sourceWordCount: slice.wordCount,
          chapterNumber: chapter.number,
          tokensUsed: result.tokensUsed,
          aiModel: this.claude.getModel(),
          editorPass: false,
          completedAt: new Date(),
        },
      });

      this.logger.log(`✅ Preview ${previewId} completed (${result.tokensUsed} tokens)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Preview ${previewId} failed: ${message}`);
      await this.prisma.bookPreview.update({
        where: { id: previewId },
        data: { status: 'FAILED', errorMessage: message },
      });
      throw err;
    }
  }

  /**
   * Lowest-numbered chapter with enough words to be real content, so a parsed
   * title page or TOC entry doesn't become the sample. Falls back to the first
   * chapter when every chapter is short.
   */
  private async pickChapter(bookId: string) {
    const substantial = await this.prisma.chapter.findFirst({
      where: { bookId, wordCount: { gte: PREVIEW_MIN_CHAPTER_WORDS } },
      orderBy: { number: 'asc' },
      select: { id: true, number: true, originalContent: true },
    });
    if (substantial) return substantial;

    return this.prisma.chapter.findFirst({
      where: { bookId },
      orderBy: { number: 'asc' },
      select: { id: true, number: true, originalContent: true },
    });
  }
}
