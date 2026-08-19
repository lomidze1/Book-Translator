import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import {
  PREVIEW_QUEUE,
  PREVIEW_JOB_OPTIONS,
  getRedisConnection,
  previewJobId,
} from './preview.constants';

const DEFAULT_DAILY_LIMIT = 3;
const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Shape returned to clients. Never widen this without re-reading toPublic(). */
export interface PublicPreview {
  id: string;
  status: string;
  targetLanguage: string;
  content: string | null;
  sourceText: string | null;
  sourceWordCount: number | null;
  chapterNumber: number | null;
  editorPass: boolean;
  createdAt: Date;
  completedAt: Date | null;
}

@Injectable()
export class PreviewService implements OnModuleDestroy {
  private readonly logger = new Logger(PreviewService.name);
  private queue: Queue | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    try {
      this.queue = new Queue(PREVIEW_QUEUE, { connection: getRedisConnection() });
      this.logger.log('Preview queue initialized');
    } catch (err) {
      this.logger.error(`Preview queue init failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  /**
   * Strip unfinished content on the way out. A PENDING/IN_PROGRESS/FAILED row can
   * hold a partial or stale translation, and handing that to the client is
   * exactly the leak getTranslation() has (it returns every TranslatedChapter at
   * any status). Written as an explicit mapping rather than a Prisma `select` so
   * adding a column can't silently widen the response.
   */
  private toPublic(row: {
    id: string;
    status: string;
    targetLanguage: string;
    content: string | null;
    sourceText: string | null;
    sourceWordCount: number | null;
    chapterNumber: number | null;
    editorPass: boolean;
    createdAt: Date;
    completedAt: Date | null;
  }): PublicPreview {
    const ready = row.status === 'COMPLETED';
    return {
      id: row.id,
      status: row.status,
      targetLanguage: row.targetLanguage,
      content: ready ? row.content : null,
      sourceText: ready ? row.sourceText : null,
      sourceWordCount: row.sourceWordCount,
      chapterNumber: row.chapterNumber,
      editorPass: row.editorPass,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
    };
  }

  /**
   * Requires an existing UserBook. Deliberately does NOT auto-create one:
   * book ids are enumerable via the @Public() GET /books, and
   * books.service.verifyOwnership treats any UserBook row as edit/delete rights.
   */
  private async assertOwnership(bookId: string, userId: string) {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      select: {
        id: true,
        title: true,
        originalFileUrl: true,
        originalFormat: true,
        userBooks: { where: { userId }, select: { id: true } },
        _count: { select: { chapters: true } },
      },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }
    if (book.userBooks.length === 0) {
      throw new ForbiddenException('You do not have access to this book');
    }
    return book;
  }

  private async assertQuota(userId: string) {
    const limit = parseInt(
      this.config.get<string>('PREVIEW_DAILY_LIMIT') || String(DEFAULT_DAILY_LIMIT),
      10,
    );
    const used = await this.prisma.bookPreview.count({
      where: { requestedById: userId, createdAt: { gte: new Date(Date.now() - QUOTA_WINDOW_MS) } },
    });
    if (used >= limit) {
      throw new ForbiddenException('PREVIEW_QUOTA_EXCEEDED');
    }
  }

  /**
   * Generate (or return a cached) preview. Cached hits cost nothing and don't
   * consume quota — the whole point of keying on (bookId, targetLanguage) is
   * that the API cost for a given book is paid exactly once.
   */
  async createPreview(bookId: string, userId: string, targetLanguage = 'ka') {
    const book = await this.assertOwnership(bookId, userId);

    // The stored file is only needed to parse chapters. A book that already has
    // chapters (seeded, imported, or previewed before) is previewable without it.
    if (book._count.chapters === 0 && !book.originalFileUrl) {
      throw new BadRequestException('Book file is not available');
    }

    const existing = await this.prisma.bookPreview.findUnique({
      where: { bookId_targetLanguage: { bookId, targetLanguage } },
    });

    if (existing && existing.status === 'COMPLETED') {
      return { id: existing.id, status: existing.status, cached: true };
    }
    if (existing && (existing.status === 'PENDING' || existing.status === 'IN_PROGRESS')) {
      return { id: existing.id, status: existing.status, cached: false };
    }

    // New row, or retrying a FAILED one — both spend tokens, so both cost quota.
    await this.assertQuota(userId);

    const preview = await this.prisma.bookPreview.upsert({
      where: { bookId_targetLanguage: { bookId, targetLanguage } },
      create: { bookId, targetLanguage, status: 'PENDING', requestedById: userId },
      update: {
        status: 'PENDING',
        requestedById: userId,
        content: null,
        sourceText: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
      },
    });

    await this.clearQueuedJob(preview.id);

    if (this.queue) {
      await this.queue.add(
        'generate-preview',
        { previewId: preview.id, bookId, targetLanguage },
        { ...PREVIEW_JOB_OPTIONS, jobId: previewJobId(preview.id) },
      );
    } else {
      this.logger.warn(`Queue unavailable — preview ${preview.id} will not be processed`);
    }

    return { id: preview.id, status: preview.status, cached: false };
  }

  async getPreviewByBook(
    bookId: string,
    userId: string,
    targetLanguage = 'ka',
  ): Promise<PublicPreview> {
    await this.assertOwnership(bookId, userId);

    const preview = await this.prisma.bookPreview.findUnique({
      where: { bookId_targetLanguage: { bookId, targetLanguage } },
    });

    if (!preview) {
      throw new NotFoundException('Preview not found');
    }
    return this.toPublic(preview);
  }

  /**
   * Drop a finished/failed job so its deterministic id can be reused. Refuses to
   * touch an active job — the caller should wait that one out.
   */
  async clearQueuedJob(previewId: string): Promise<boolean> {
    if (!this.queue) return false;
    const job = await this.queue.getJob(previewJobId(previewId));
    if (!job) return false;
    if ((await job.getState()) === 'active') {
      throw new BadRequestException('Preview is actively being generated — wait for it to finish.');
    }
    await job.remove();
    return true;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
    }
  }
}
