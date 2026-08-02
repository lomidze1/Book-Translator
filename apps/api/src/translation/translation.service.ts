import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { ChapterQualityReport } from './quality-check.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { ParsingService } from '../parsing/parsing.service';
import { fetchWithTimeout } from '../common/fetch';
import { clampPagination } from '../common/pagination';
import { TRANSLATION_QUEUE, TRANSLATION_JOB_OPTIONS, getRedisConnection, translationJobId } from './translation.constants';
import { devShortcutsEnabled } from '../common/dev-shortcuts';

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);
  private queue: Queue | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly parsing: ParsingService,
  ) {
    try {
      const redisConn = getRedisConnection();
      this.logger.log(`Initializing BullMQ Queue — Redis at ${redisConn.host}:${redisConn.port}`);
      this.queue = new Queue(TRANSLATION_QUEUE, {
        connection: redisConn,
      });
      this.logger.log('✅ BullMQ Queue initialized successfully');
    } catch (err) {
      this.logger.error(`❌ BullMQ queue init FAILED: ${err instanceof Error ? err.stack : err}`);
    }
  }

  async createTranslation(bookId: string, userId: string, targetLanguage = 'ka', translationType: 'FAST' | 'STANDARD' = 'FAST') {
    // Check book exists and verify ownership (select only needed fields)
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      select: {
        id: true,
        originalFileUrl: true,
        originalFormat: true,
        userBooks: { where: { userId }, select: { id: true } },
        _count: { select: { chapters: true, userBooks: true } },
      },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    // Claim ownership only for a book nobody owns yet — the anonymous-upload
    // case. Claiming unconditionally was a privilege escalation: book ids are
    // enumerable via the @Public() GET /books, and books.service.verifyOwnership
    // treats any UserBook row as the right to PATCH/DELETE the book. So any
    // logged-in user could POST a stranger's bookId here and then delete it.
    if (book.userBooks.length === 0) {
      if (book._count.userBooks > 0) {
        throw new ForbiddenException('You do not have access to this book');
      }
      await this.prisma.userBook.create({
        data: { userId, bookId, type: 'UPLOADED' },
      });
    }

    // Check if translation already exists
    const existing = await this.prisma.translation.findFirst({
      where: {
        bookId,
        targetLanguage,
        status: { in: ['PENDING', 'PAID', 'IN_PROGRESS', 'COMPLETED'] },
      },
    });

    if (existing) {
      throw new BadRequestException('Translation already exists for this book');
    }

    // If book has no chapters yet, parse the file
    if (book._count.chapters === 0 && book.originalFileUrl) {
      await this.parseAndSaveChapters(book.id, book.originalFileUrl, book.originalFormat || 'PDF');
    }

    // In development, skip payment — set status to PAID directly.
    // Fail-secure: requires NODE_ENV=development AND ENABLE_DEV_SHORTCUTS=true.
    // Either alone is not enough — a misconfigured env (NODE_ENV empty,
    // 'staging', 'test') used to unlock the payment-skip path.
    const isDev = devShortcutsEnabled();
    const initialStatus = isDev ? 'PAID' : 'PENDING';

    const translation = await this.prisma.translation.create({
      data: {
        bookId,
        sourceLanguage: 'en',
        targetLanguage,
        translationType,
        status: initialStatus,
        progress: 0,
      },
    });

    // In dev mode, auto-start translation (skip payment step)
    if (isDev) {
      if (this.queue) {
        this.logger.log(`Dev mode: auto-starting translation ${translation.id}`);
        await this.startTranslation(translation.id);
      } else {
        this.logger.warn(`Queue not available — cannot auto-start translation ${translation.id}. Retrying queue init...`);
        // Retry queue initialization
        try {
          this.queue = new (await import('bullmq')).Queue(TRANSLATION_QUEUE, {
            connection: getRedisConnection(),
          });
          await this.startTranslation(translation.id);
        } catch (err) {
          this.logger.error(`Failed to initialize queue: ${err instanceof Error ? err.message : err}`);
        }
      }
    }

    return translation;
  }

  async startTranslation(translationId: string) {
    const translation = await this.prisma.translation.findUnique({
      where: { id: translationId },
    });

    if (!translation) {
      throw new NotFoundException('Translation not found');
    }

    if (translation.status !== 'PAID') {
      this.logger.warn(`Cannot start translation ${translationId}: status is ${translation.status}`);
      return translation;
    }

    // Add to queue. Deterministic jobId — BullMQ silently rejects a second
    // add() with the same id while the prior job is still in the queue, so
    // double-clicks and webhook replays can't stack workers on one row.
    if (this.queue) {
      this.logger.log(`Adding translation ${translationId} to queue...`);
      await this.queue.add(
        'translate-book',
        { translationId: translation.id, bookId: translation.bookId },
        { ...TRANSLATION_JOB_OPTIONS, jobId: translationJobId(translation.id) },
      );
      this.logger.log(`Translation ${translationId} added to queue`);
    } else {
      this.logger.warn(`Queue unavailable — cannot process translation ${translationId}`);
    }

    return translation;
  }

  /**
   * Drop any queued/failed BullMQ job for this translation so a retry can be
   * re-added cleanly. Refuses to remove an actively-running job — that's the
   * caller's signal that retry is unsafe and they should wait it out. Returns
   * true if a job was removed, false if none existed.
   */
  async clearQueuedJob(translationId: string): Promise<boolean> {
    if (!this.queue) return false;
    const existing = await this.queue.getJob(translationJobId(translationId));
    if (!existing) return false;
    const state = await existing.getState();
    if (state === 'active') {
      throw new BadRequestException(
        'Translation is actively being processed — wait for it to finish or fail.',
      );
    }
    await existing.remove();
    return true;
  }

  async getTranslation(translationId: string, userId: string) {
    const translation = await this.prisma.translation.findUnique({
      where: { id: translationId },
      include: {
        book: {
          select: { id: true, title: true, author: true, userBooks: { where: { userId }, select: { userId: true } } },
        },
        translatedChapters: {
          include: { chapter: { select: { number: true, title: true } } },
          orderBy: { chapter: { number: 'asc' } },
        },
      },
    });

    if (!translation) {
      throw new NotFoundException('Translation not found');
    }

    // Verify ownership
    if (translation.book.userBooks.length === 0) {
      throw new ForbiddenException('You do not have access to this translation');
    }

    return translation;
  }

  async getTranslationsByBook(bookId: string, userId: string, page = 1, limit = 50) {
    // Verify book ownership first
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      select: { id: true, userBooks: { where: { userId }, select: { id: true } } },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    if (book.userBooks.length === 0) {
      throw new ForbiddenException('You do not have access to this book');
    }

    const { skip, take } = clampPagination(page, limit);
    return this.prisma.translation.findMany({
      where: { bookId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async getMyTranslations(userId: string, page = 1, limit = 50) {
    const { skip, take } = clampPagination(page, limit, { defaultLimit: 50, maxLimit: 100 });
    return this.prisma.translation.findMany({
      where: {
        book: {
          userBooks: { some: { userId } },
        },
      },
      include: {
        book: { select: { id: true, title: true, author: true, coverUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async updateProgress(translationId: string, progress: number, status?: string) {
    const data: { progress: number; status?: any; startedAt?: Date; completedAt?: Date } = { progress };
    if (status) data.status = status;
    if (status === 'IN_PROGRESS' && progress === 0) data.startedAt = new Date();
    if (status === 'COMPLETED') data.completedAt = new Date();

    return this.prisma.translation.update({
      where: { id: translationId },
      data,
    });
  }

  async saveTranslatedChapter(
    translationId: string,
    chapterId: string,
    translatedContent: string,
    qualityReport?: ChapterQualityReport,
  ) {
    const reportData = qualityReport
      ? { qualityReport: qualityReport as unknown as Prisma.InputJsonValue }
      : {};
    return this.prisma.translatedChapter.upsert({
      where: {
        translationId_chapterId: { translationId, chapterId },
      },
      create: { translationId, chapterId, translatedContent, ...reportData },
      update: { translatedContent, ...reportData },
    });
  }

  /**
   * Public so the preview worker can warm a book's chapters before the user
   * pays — which also moves this S3-download-and-parse off the HTTP request
   * path for the eventual purchase.
   */
  async parseAndSaveChapters(bookId: string, s3Key: string, format: string) {
    // Download from S3 (large files — give a generous timeout).
    const url = await this.s3.getPresignedUrl(s3Key);
    const response = await fetchWithTimeout(url, {}, 60_000);
    const buffer = Buffer.from(await response.arrayBuffer());

    // Parse
    const parsed = await this.parsing.parse(buffer, format);

    // createMany + skipDuplicates, not a transaction of creates: two callers can
    // race here (the preview worker and POST /translations on the same book) and
    // @@unique([bookId, number]) would abort the whole transaction with P2002,
    // surfacing as a 500 on the user's purchase.
    await this.prisma.chapter.createMany({
      data: parsed.chapters.map((ch) => ({
        bookId,
        number: ch.number,
        title: ch.title,
        originalContent: ch.content,
        wordCount: ch.wordCount,
      })),
      skipDuplicates: true,
    });

    // Update book page count estimate
    await this.prisma.book.update({
      where: { id: bookId },
      data: { pageCount: Math.ceil(parsed.totalWordCount / 250) },
    });
  }
}
