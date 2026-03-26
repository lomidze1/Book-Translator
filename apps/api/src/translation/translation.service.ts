import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { ParsingService } from '../parsing/parsing.service';

const TRANSLATION_QUEUE = 'translation';

@Injectable()
export class TranslationService {
  private queue: Queue | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly parsing: ParsingService,
  ) {
    try {
      this.queue = new Queue(TRANSLATION_QUEUE, {
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        },
      });
    } catch {
      console.warn('⚠️  BullMQ queue not initialized — Redis may be unavailable');
    }
  }

  async createTranslation(bookId: string, userId: string, targetLanguage = 'ka') {
    // Check book exists
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      include: { chapters: true },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
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
    if (book.chapters.length === 0 && book.originalFileUrl) {
      await this.parseAndSaveChapters(book.id, book.originalFileUrl, book.originalFormat || 'PDF');
    }

    // Create translation record
    const translation = await this.prisma.translation.create({
      data: {
        bookId,
        sourceLanguage: 'en',
        targetLanguage,
        status: 'PENDING',
        progress: 0,
      },
    });

    // Add to queue (skip payment for now — Phase 4)
    if (this.queue) {
      await this.queue.add('translate-book', {
        translationId: translation.id,
        bookId,
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });
    }

    return translation;
  }

  async getTranslation(translationId: string) {
    const translation = await this.prisma.translation.findUnique({
      where: { id: translationId },
      include: {
        book: { select: { id: true, title: true, author: true } },
        translatedChapters: {
          include: { chapter: { select: { number: true, title: true } } },
          orderBy: { chapter: { number: 'asc' } },
        },
      },
    });

    if (!translation) {
      throw new NotFoundException('Translation not found');
    }

    return translation;
  }

  async getTranslationsByBook(bookId: string) {
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
    const data: Record<string, unknown> = { progress };
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

    // Save chapters
    for (const ch of parsed.chapters) {
      await this.prisma.chapter.create({
        data: {
          bookId,
          number: ch.number,
          title: ch.title,
          originalContent: ch.content,
          wordCount: ch.wordCount,
        },
      });
    }

    // Update book page count estimate
    await this.prisma.book.update({
      where: { id: bookId },
      data: { pageCount: Math.ceil(parsed.totalWordCount / 250) },
    });
  }
}
