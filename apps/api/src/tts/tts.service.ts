import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { SynthesizeDto, SynthesizeBookDto } from './dto/synthesize.dto';
import { TTS_QUEUE, getRedisConnection } from './tts.constants';
import { ElevenLabsProvider } from './providers/elevenlabs.provider';
import { AzureProvider } from './providers/azure.provider';
import { TtsProvider, Voice } from './providers/tts-provider.interface';
import type { TtsJobData } from './tts.processor';

@Injectable()
export class TtsService implements OnModuleDestroy {
  private readonly logger = new Logger(TtsService.name);
  private queue: Queue | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly elevenlabs: ElevenLabsProvider,
    private readonly azure: AzureProvider,
  ) {
    try {
      this.queue = new Queue(TTS_QUEUE, { connection: getRedisConnection() });
      this.logger.log('✅ TTS Queue initialized');
    } catch (err) {
      this.logger.error(`❌ TTS queue init failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
    }
  }

  private getProvider(name?: string): TtsProvider {
    const primary = process.env.TTS_PRIMARY_PROVIDER || 'elevenlabs';
    const providerName = name || primary;
    return providerName === 'azure' ? this.azure : this.elevenlabs;
  }

  // ========================
  // Audio URL (existing, updated)
  // ========================

  async getAudioUrl(bookId: string, chapterNumber: number, userId: string): Promise<string | null> {
    await this.validateBookOwnership(bookId, userId);

    const audioChapter = await this.prisma.audioChapter.findFirst({
      where: { audioBook: { bookId }, chapterNumber, status: 'COMPLETED' },
    });

    if (!audioChapter?.audioUrl) return null;

    return this.s3.getPresignedUrl(
      audioChapter.audioUrl,
      Math.min(parseInt(process.env.TTS_PRESIGNED_URL_EXPIRY || '14400'), 14400),
    );
  }

  // ========================
  // List chapters (existing, updated)
  // ========================

  async listAudioChapters(bookId: string, userId: string) {
    await this.validateBookOwnership(bookId, userId);

    const audioBook = await this.prisma.audioBook.findFirst({
      where: { bookId },
      include: {
        chapters: { orderBy: { chapterNumber: 'asc' } },
      },
    });

    if (!audioBook) return [];

    return audioBook.chapters.map((ch) => ({
      audioChapterId: ch.id,
      chapterNumber: ch.chapterNumber,
      duration: ch.duration,
      fileSize: ch.fileSize,
      format: ch.format,
      status: ch.status,
    }));
  }

  // ========================
  // Synthesize single chapter
  // ========================

  async synthesize(userId: string, dto: SynthesizeDto) {
    const { translation, book } = await this.validateAndGetTranslation(dto.bookId, userId);

    const voiceId = dto.voiceId || process.env.ELEVENLABS_DEFAULT_VOICE_ID || 'default';
    const speed = dto.speed || 1.0;
    const providerName = dto.provider || process.env.TTS_PRIMARY_PROVIDER || 'elevenlabs';

    // Get or create AudioBook
    let audioBook = await this.prisma.audioBook.findFirst({
      where: { bookId: dto.bookId, translationId: translation.id, voiceId },
    });

    if (!audioBook) {
      audioBook = await this.prisma.audioBook.create({
        data: {
          bookId: dto.bookId,
          translationId: translation.id,
          voiceId,
          status: 'PENDING',
          totalChapters: 1,
        },
      });
    }

    // Check if audio already exists (caching)
    const existingChapter = await this.prisma.audioChapter.findFirst({
      where: { audioBookId: audioBook.id, chapterNumber: dto.chapterNumber, status: 'COMPLETED' },
    });

    if (existingChapter?.audioUrl) {
      return {
        audioBookId: audioBook.id,
        audioChapterId: existingChapter.id,
        status: 'ready',
        audioUrl: await this.s3.getPresignedUrl(
          existingChapter.audioUrl,
          parseInt(process.env.TTS_PRESIGNED_URL_EXPIRY || '14400'),
        ),
      };
    }

    // Get translated chapter text
    const translatedChapter = await this.prisma.translatedChapter.findFirst({
      where: { translationId: translation.id, chapter: { number: dto.chapterNumber } },
      include: { chapter: true },
    });

    if (!translatedChapter) {
      throw new NotFoundException('თარგმნილი თავი ვერ მოიძებნა');
    }

    // Create or get AudioChapter record (upsert to prevent P2002 on concurrent requests)
    const audioChapter = await this.prisma.audioChapter.upsert({
      where: {
        audioBookId_chapterNumber: {
          audioBookId: audioBook.id,
          chapterNumber: dto.chapterNumber,
        },
      },
      update: {},
      create: {
        audioBookId: audioBook.id,
        chapterId: translatedChapter.chapter.id,
        chapterNumber: dto.chapterNumber,
        status: 'PENDING',
      },
    });

    // Add job to queue
    if (this.queue) {
      const jobData: TtsJobData = {
        audioBookId: audioBook.id,
        audioChapterId: audioChapter.id,
        bookId: dto.bookId,
        chapterId: translatedChapter.chapter.id,
        chapterNumber: dto.chapterNumber,
        translatedText: translatedChapter.translatedContent,
        voiceId,
        speed,
        provider: providerName as 'elevenlabs' | 'azure',
        totalChapters: audioBook.totalChapters,
        completedSoFar: audioBook.completedChapters,
      };

      await this.queue.add('synthesize-chapter', jobData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });
    }

    return {
      audioBookId: audioBook.id,
      audioChapterId: audioChapter.id,
      status: 'queued',
    };
  }

  // ========================
  // Synthesize full book
  // ========================

  async synthesizeBook(userId: string, dto: SynthesizeBookDto) {
    const { translation } = await this.validateAndGetTranslation(dto.bookId, userId);

    const voiceId = dto.voiceId || process.env.ELEVENLABS_DEFAULT_VOICE_ID || 'default';
    const speed = dto.speed || 1.0;
    const providerName = dto.provider || process.env.TTS_PRIMARY_PROVIDER || 'elevenlabs';

    // Get all translated chapters
    const translatedChapters = await this.prisma.translatedChapter.findMany({
      where: { translationId: translation.id },
      include: { chapter: true },
      orderBy: { chapter: { number: 'asc' } },
    });

    if (translatedChapters.length === 0) {
      throw new NotFoundException('თარგმნილი თავები ვერ მოიძებნა');
    }

    // Get or create AudioBook
    let audioBook = await this.prisma.audioBook.findFirst({
      where: { bookId: dto.bookId, translationId: translation.id, voiceId },
    });

    if (!audioBook) {
      audioBook = await this.prisma.audioBook.create({
        data: {
          bookId: dto.bookId,
          translationId: translation.id,
          voiceId,
          status: 'PENDING',
          totalChapters: translatedChapters.length,
        },
      });
    }

    // Batch-fetch all existing AudioChapters to avoid N+1 queries
    const existingAudioChapters = await this.prisma.audioChapter.findMany({
      where: { audioBookId: audioBook.id },
    });
    const chapterMap = new Map(
      existingAudioChapters.map((ac) => [ac.chapterNumber, ac]),
    );

    // Create AudioChapter records and queue jobs
    let queued = 0;
    for (let i = 0; i < translatedChapters.length; i++) {
      const tc = translatedChapters[i];
      const existing = chapterMap.get(tc.chapter.number);

      // Skip already completed chapters
      if (existing?.status === 'COMPLETED') continue;

      // Use existing pending record or create new one via upsert (P2002-safe)
      const audioChapter = await this.prisma.audioChapter.upsert({
        where: {
          audioBookId_chapterNumber: {
            audioBookId: audioBook.id,
            chapterNumber: tc.chapter.number,
          },
        },
        update: {},
        create: {
          audioBookId: audioBook.id,
          chapterId: tc.chapter.id,
          chapterNumber: tc.chapter.number,
          status: 'PENDING',
        },
      });

      if (this.queue) {
        const jobData: TtsJobData = {
          audioBookId: audioBook.id,
          audioChapterId: audioChapter.id,
          bookId: dto.bookId,
          chapterId: tc.chapter.id,
          chapterNumber: tc.chapter.number,
          translatedText: tc.translatedContent,
          voiceId,
          speed,
          provider: providerName as 'elevenlabs' | 'azure',
          totalChapters: translatedChapters.length,
          completedSoFar: i,
        };

        await this.queue.add('synthesize-chapter', jobData, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        });
        queued++;
      }
    }

    return {
      audioBookId: audioBook.id,
      totalChapters: translatedChapters.length,
      queued,
      status: 'queued',
    };
  }

  // ========================
  // Get voices
  // ========================

  async getVoices(language?: string): Promise<Voice[]> {
    const provider = this.getProvider();
    return provider.getVoices(language || 'ka');
  }

  // ========================
  // Get AudioBook status
  // ========================

  async getAudioBookStatus(audioBookId: string, userId: string) {
    const audioBook = await this.prisma.audioBook.findUnique({
      where: { id: audioBookId },
      include: {
        chapters: { orderBy: { chapterNumber: 'asc' } },
        book: { include: { userBooks: { where: { userId } } } },
      },
    });

    if (!audioBook) {
      throw new NotFoundException('AudioBook ვერ მოიძებნა');
    }

    if (audioBook.book.userBooks.length === 0) {
      throw new ForbiddenException('არ გაქვთ ამ AudioBook-ზე წვდომა');
    }

    return {
      id: audioBook.id,
      status: audioBook.status,
      progress: audioBook.progress,
      totalDuration: audioBook.totalDuration,
      totalSize: audioBook.totalSize,
      totalChapters: audioBook.totalChapters,
      completedChapters: audioBook.completedChapters,
      chapters: audioBook.chapters.map((ch) => ({
        audioChapterId: ch.id,
        chapterNumber: ch.chapterNumber,
        duration: ch.duration,
        status: ch.status,
      })),
    };
  }

  // ========================
  // Get stream URL
  // ========================

  async getStreamUrl(audioChapterId: string, userId: string): Promise<string> {
    const audioChapter = await this.prisma.audioChapter.findUnique({
      where: { id: audioChapterId },
      include: {
        audioBook: {
          include: { book: { include: { userBooks: { where: { userId } } } } },
        },
      },
    });

    if (!audioChapter) {
      throw new NotFoundException('AudioChapter ვერ მოიძებნა');
    }

    if (audioChapter.audioBook.book.userBooks.length === 0) {
      throw new ForbiddenException('არ გაქვთ ამ აუდიოზე წვდომა');
    }

    if (!audioChapter.audioUrl) {
      throw new NotFoundException('აუდიო ჯერ არ არის მზად');
    }

    return this.s3.getPresignedUrl(
      audioChapter.audioUrl,
      parseInt(process.env.TTS_PRESIGNED_URL_EXPIRY || '14400'),
    );
  }

  // ========================
  // Delete AudioBook
  // ========================

  async deleteAudioBook(audioBookId: string, userId: string): Promise<void> {
    const audioBook = await this.prisma.audioBook.findUnique({
      where: { id: audioBookId },
      include: {
        chapters: true,
        book: { include: { userBooks: { where: { userId } } } },
      },
    });

    if (!audioBook) {
      throw new NotFoundException('AudioBook ვერ მოიძებნა');
    }

    if (audioBook.book.userBooks.length === 0) {
      throw new ForbiddenException('არ გაქვთ ამ AudioBook-ის წაშლის უფლება');
    }

    // Delete S3 files
    for (const chapter of audioBook.chapters) {
      if (chapter.audioUrl) {
        await this.s3.delete(chapter.audioUrl).catch(() => {});
      }
    }

    // Delete records (cascade will handle AudioChapters)
    await this.prisma.audioBook.delete({ where: { id: audioBookId } });
  }

  // ========================
  // Helpers
  // ========================

  private async validateBookOwnership(bookId: string, userId: string) {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      include: { userBooks: { where: { userId } } },
    });

    if (!book) {
      throw new NotFoundException('წიგნი ვერ მოიძებნა');
    }

    if (book.userBooks.length === 0) {
      throw new ForbiddenException('არ გაქვთ ამ წიგნზე წვდომა');
    }

    return book;
  }

  private async validateAndGetTranslation(bookId: string, userId: string) {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      include: { userBooks: { where: { userId } } },
    });

    if (!book) {
      throw new NotFoundException('წიგნი ვერ მოიძებნა');
    }

    if (book.userBooks.length === 0) {
      throw new ForbiddenException('არ გაქვთ ამ წიგნზე წვდომა');
    }

    const translation = await this.prisma.translation.findFirst({
      where: { bookId, status: 'COMPLETED' },
    });

    if (!translation) {
      throw new NotFoundException('დასრულებული თარგმანი ვერ მოიძებნა');
    }

    return { translation, book };
  }
}
