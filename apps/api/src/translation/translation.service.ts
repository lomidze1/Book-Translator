import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { ParsingService } from '../parsing/parsing.service';
import { TRANSLATION_QUEUE, getRedisConnection } from './translation.constants';

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
        _count: { select: { chapters: true } },
      },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    // Auto-create UserBook if user doesn't own the book yet
    // (e.g., book was uploaded anonymously before login)
    if (book.userBooks.length === 0) {
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

    // In development, skip payment — set status to PAID directly
    const isDev = process.env.NODE_ENV !== 'production';
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

    // Add to queue
    if (this.queue) {
      this.logger.log(`Adding translation ${translationId} to queue...`);
      await this.queue.add('translate-book', {
        translationId: translation.id,
        bookId: translation.bookId,
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });
      this.logger.log(`Translation ${translationId} added to queue`);
    } else {
      this.logger.warn(`Queue unavailable — cannot process translation ${translationId}`);
    }

    return translation;
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

  async getTranslationsByBook(bookId: string, userId: string) {
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

    return this.prisma.translation.findMany({
      where: { bookId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMyTranslations(userId: string) {
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
  ) {
    return this.prisma.translatedChapter.upsert({
      where: {
        translationId_chapterId: { translationId, chapterId },
      },
      create: { translationId, chapterId, translatedContent },
      update: { translatedContent },
    });
  }

  private async parseAndSaveChapters(bookId: string, s3Key: string, format: string) {
    // Download from S3
    const url = await this.s3.getPresignedUrl(s3Key);
    const response = await fetch(url);
    const buffer = Buffer.from(await response.arrayBuffer());

    // Parse
    const parsed = await this.parsing.parse(buffer, format);

    // Save chapters in transaction
    await this.prisma.$transaction(
      parsed.chapters.map((ch) =>
        this.prisma.chapter.create({
          data: {
            bookId,
            number: ch.number,
            title: ch.title,
            originalContent: ch.content,
            wordCount: ch.wordCount,
          },
        }),
      ),
    );

    // Update book page count estimate
    await this.prisma.book.update({
      where: { id: bookId },
      data: { pageCount: Math.ceil(parsed.totalWordCount / 250) },
    });
  }
}
