import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { SynthesizeDto, SynthesizeBookDto } from './dto/synthesize.dto';
import { TTS_QUEUE, TTS_JOB_OPTIONS, getRedisConnection } from './tts.constants';
import { ProviderManager } from './providers/provider-manager';
import { Voice } from './providers/tts-provider.interface';
import type { TtsJobData } from './tts.processor';

const PRESIGNED_URL_MAX_EXPIRY = 14400; // 4 hours

@Injectable()
export class TtsService implements OnModuleDestroy {
  private readonly logger = new Logger(TtsService.name);
  private queue: Queue | null = null;
  private readonly presignedExpiry: number;
  private readonly defaultVoiceId: string;
  private readonly defaultProvider: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly providerManager: ProviderManager,
    private readonly config: ConfigService,
  ) {
    this.presignedExpiry = Math.min(
      parseInt(this.config.get<string>('TTS_PRESIGNED_URL_EXPIRY') || String(PRESIGNED_URL_MAX_EXPIRY), 10),
      PRESIGNED_URL_MAX_EXPIRY,
    );
    this.defaultVoiceId = this.config.get<string>('ELEVENLABS_DEFAULT_VOICE_ID') || 'default';
    this.defaultProvider = this.config.get<string>('TTS_PRIMARY_PROVIDER') || 'elevenlabs';

    try {
      this.queue = new Queue(TTS_QUEUE, { connection: getRedisConnection() });
      this.logger.log('TTS Queue initialized');
    } catch (err) {
      this.logger.error(`TTS queue init failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
    }
  }

  private getProvider(name?: string) {
    return this.providerManager.getProvider(name);
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
      this.presignedExpiry,
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

    const voiceId = dto.voiceId || this.defaultVoiceId;
    const speed = dto.speed || 1.0;
    const providerName = dto.provider || this.defaultProvider;

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
          this.presignedExpiry,
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
        provider: providerName as 'google-cloud' | 'elevenlabs' | 'azure',
        totalChapters: audioBook.totalChapters,
        completedSoFar: audioBook.completedChapters,
      };

      await this.queue.add('synthesize-chapter', jobData, TTS_JOB_OPTIONS);
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

    const voiceId = dto.voiceId || this.defaultVoiceId;
    const speed = dto.speed || 1.0;
    const providerName = dto.provider || this.defaultProvider;

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

    // Bulk-create missing AudioChapter rows in a single round-trip. Previously
    // this loop did N sequential `upsert()`s — for a 100-chapter book that's
    // ~3-5s of pure DB latency before any TTS work could be queued.
    // skipDuplicates handles the race where another concurrent request created
    // the same (audioBookId, chapterNumber) row first.
    const toCreate = translatedChapters
      .filter((tc) => {
        const existing = chapterMap.get(tc.chapter.number);
        return !existing; // existing rows are either COMPLETED (skipped below) or already PENDING (reusable)
      })
      .map((tc) => ({
        audioBookId: audioBook!.id,
        chapterId: tc.chapter.id,
        chapterNumber: tc.chapter.number,
        status: 'PENDING' as const,
      }));

    if (toCreate.length > 0) {
      await this.prisma.audioChapter.createMany({
        data: toCreate,
        skipDuplicates: true,
      });

      // Re-read the rows we just created so we have the generated ids.
      const created = await this.prisma.audioChapter.findMany({
        where: {
          audioBookId: audioBook.id,
          chapterNumber: { in: toCreate.map((c) => c.chapterNumber) },
        },
      });
      for (const ac of created) chapterMap.set(ac.chapterNumber, ac);
    }

    // Queue jobs for every non-completed chapter.
    let queued = 0;
    for (let i = 0; i < translatedChapters.length; i++) {
      const tc = translatedChapters[i];
      const audioChapter = chapterMap.get(tc.chapter.number);
      if (!audioChapter) continue;
      if (audioChapter.status === 'COMPLETED') continue;

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
          provider: providerName as 'google-cloud' | 'elevenlabs' | 'azure',
          totalChapters: translatedChapters.length,
          completedSoFar: i,
        };

        await this.queue.add('synthesize-chapter', jobData, TTS_JOB_OPTIONS);
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
    const audioBook = await this.loadOwnedAudioBook(audioBookId, userId, {
      chapters: { orderBy: { chapterNumber: 'asc' } },
    });

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
    const audioChapter = await this.loadOwnedAudioChapter(audioChapterId, userId);

    if (!audioChapter.audioUrl) {
      throw new NotFoundException('აუდიო ჯერ არ არის მზად');
    }

    return this.s3.getPresignedUrl(
      audioChapter.audioUrl,
      this.presignedExpiry,
    );
  }

  // ========================
  // Delete AudioBook
  // ========================

  async deleteAudioBook(audioBookId: string, userId: string): Promise<void> {
    // Note: the previous inline check threw a "წაშლის უფლება" message; the
    // shared helper uses a generic "AudioBook-ზე წვდომა" — close enough.
    const audioBook = await this.loadOwnedAudioBook(audioBookId, userId, {
      chapters: true,
    });

    // An AudioBook hangs off a Book that duplicate-hash uploads can attach
    // unrelated users to (see BooksService.handleUpload), and ownership here is
    // "has any UserBook row". Deleting would destroy audio the other owners
    // paid to generate, so a co-owned AudioBook is not the caller's to remove.
    const coOwners = await this.prisma.userBook.count({
      where: { bookId: audioBook.bookId, userId: { not: userId } },
    });
    if (coOwners > 0) {
      throw new ForbiddenException(
        'აუდიოწიგნი სხვა მომხმარებლებთანაც არის გაზიარებული და მისი წაშლა შეუძლებელია',
      );
    }

    // Delete S3 files in parallel — sequential awaits could take 30s+ on a
    // 100-chapter audiobook. Failures are swallowed so a missing object never
    // blocks the DB cascade.
    await Promise.all(
      audioBook.chapters
        .filter((c) => c.audioUrl)
        .map((c) => this.s3.delete(c.audioUrl!).catch(() => undefined)),
    );

    // Delete records (cascade will handle AudioChapters)
    await this.prisma.audioBook.delete({ where: { id: audioBookId } });
  }

  // ========================
  // Estimate cost/time
  // ========================

  async estimate(bookId: string, userId: string, providerName?: string) {
    const { translation } = await this.validateAndGetTranslation(bookId, userId);

    const translatedChapters = await this.prisma.translatedChapter.findMany({
      where: { translationId: translation.id },
      include: { chapter: true },
    });

    if (translatedChapters.length === 0) {
      throw new NotFoundException('თარგმნილი თავები ვ��რ მოიძებნა');
    }

    const totalCharacters = translatedChapters.reduce(
      (sum, tc) => sum + (tc.translatedContent?.length || 0), 0,
    );

    const provider = providerName || this.config.get<string>('TTS_PRIMARY_PROVIDER') || 'google-cloud';
    const costEstimate = this.providerManager.estimateCost(totalCharacters, provider);
    const costUsd = costEstimate.costUsd;
    const estimatedAudioMinutes = costEstimate.estimatedAudioMinutes;

    return {
      totalChapters: translatedChapters.length,
      totalCharacters,
      estimatedCostUsd: Math.round(costUsd * 100) / 100,
      estimatedAudioMinutes: Math.round(estimatedAudioMinutes * 10) / 10,
      estimatedAudioHours: Math.round((estimatedAudioMinutes / 60) * 10) / 10,
      provider,
    };
  }

  // ========================
  // Retry failed chapters
  // ========================

  async retryFailed(audioBookId: string, userId: string) {
    const audioBook = await this.loadOwnedAudioBook(audioBookId, userId, {
      chapters: { where: { status: 'FAILED' } },
    });

    const failedChapters = audioBook.chapters;
    if (failedChapters.length === 0) {
      return { audioBookId, retriedChapters: [], status: 'no_failures' };
    }

    // Get translation for text content
    const translation = await this.prisma.translation.findFirst({
      where: { bookId: audioBook.bookId, status: 'COMPLETED' },
    });

    if (!translation) {
      throw new NotFoundException('დასრულებული თარგმანი ვერ მოიძებნა');
    }

    // Batch fetch all translated chapters to avoid N+1
    const translatedChapters = await this.prisma.translatedChapter.findMany({
      where: { translationId: translation.id },
      include: { chapter: true },
    });
    const tcMap = new Map(translatedChapters.map((tc) => [tc.chapter.number, tc]));

    let queued = 0;
    const retriedChapterNumbers: number[] = [];

    for (const failedCh of failedChapters) {
      const translatedChapter = tcMap.get(failedCh.chapterNumber);
      if (!translatedChapter) continue;

      // Reset status
      await this.prisma.audioChapter.update({
        where: { id: failedCh.id },
        data: { status: 'PENDING' },
      });

      if (this.queue) {
        const jobData: TtsJobData = {
          audioBookId,
          audioChapterId: failedCh.id,
          bookId: audioBook.bookId,
          chapterId: translatedChapter.chapter.id,
          chapterNumber: failedCh.chapterNumber,
          translatedText: translatedChapter.translatedContent,
          voiceId: audioBook.voiceId,
          speed: 1.0,
          provider: (this.config.get<string>('TTS_PRIMARY_PROVIDER') || 'google-cloud') as 'google-cloud' | 'elevenlabs' | 'azure',
          totalChapters: audioBook.totalChapters,
          completedSoFar: audioBook.completedChapters,
        };

        await this.queue.add('synthesize-chapter', jobData, TTS_JOB_OPTIONS);
        queued++;
        retriedChapterNumbers.push(failedCh.chapterNumber);
      }
    }

    // Update book status
    if (queued > 0) {
      await this.prisma.audioBook.update({
        where: { id: audioBookId },
        data: { status: 'IN_PROGRESS', errorMessage: null },
      });
    }

    return {
      audioBookId,
      retriedChapters: retriedChapterNumbers,
      queued,
      status: 'queued',
    };
  }

  // ========================
  // Get timestamps for karaoke
  // ========================

  async getTimestamps(audioBookId: string, chapterNumber: number, userId: string) {
    await this.loadOwnedAudioBook(audioBookId, userId);

    const audioChapter = await this.prisma.audioChapter.findFirst({
      where: { audioBookId, chapterNumber, status: 'COMPLETED' },
    });

    if (!audioChapter) {
      throw new NotFoundException('აუდიო თავი ვერ მოიძებნა');
    }

    return {
      chapterNumber,
      timestamps: audioChapter.timestamps || [],
    };
  }

  // ========================
  // Helpers
  // ========================

  /**
   * Load an AudioBook only if the caller owns its parent book. Optional
   * `extraInclude` lets callers ask for additional relations (chapters,
   * filtered chapters, etc.) in the same query — the book + userBooks check
   * is always merged in.
   *
   * Replaces seven duplicated `findUnique → NotFound → ForbiddenException`
   * blocks that previously lived inline across this file and the gateway.
   */
  private async loadOwnedAudioBook<I extends Prisma.AudioBookInclude>(
    audioBookId: string,
    userId: string,
    extraInclude?: I,
  ): Promise<
    Prisma.AudioBookGetPayload<{ include: I }> & {
      book: { userBooks: { id: string }[] };
    }
  > {
    const include = {
      ...(extraInclude ?? {}),
      book: { include: { userBooks: { where: { userId } } } },
    } as Prisma.AudioBookInclude;

    const audioBook = await this.prisma.audioBook.findUnique({
      where: { id: audioBookId },
      include,
    });

    if (!audioBook) {
      throw new NotFoundException('AudioBook ვერ მოიძებნა');
    }
    const book = (audioBook as unknown as { book: { userBooks: unknown[] } }).book;
    if (book.userBooks.length === 0) {
      throw new ForbiddenException('არ გაქვთ ამ AudioBook-ზე წვდომა');
    }
    return audioBook as unknown as Prisma.AudioBookGetPayload<{ include: I }> & {
      book: { userBooks: { id: string }[] };
    };
  }

  /**
   * Same idea as `loadOwnedAudioBook` but starts from an AudioChapter — used
   * by streaming endpoints that take the chapter id directly.
   */
  private async loadOwnedAudioChapter(audioChapterId: string, userId: string) {
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
    return audioChapter;
  }

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
