import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { TtsGateway } from './tts.gateway';
import { ElevenLabsProvider } from './providers/elevenlabs.provider';
import { AzureProvider } from './providers/azure.provider';
import { TtsProvider } from './providers/tts-provider.interface';
import { chunkText } from './utils/text-chunker';
import { concatenateAudioBuffers } from './utils/audio-concat';
import { TTS_QUEUE, getRedisConnection } from './tts.constants';

export interface TtsJobData {
  audioBookId: string;
  audioChapterId: string;
  bookId: string;
  chapterId: string;
  chapterNumber: number;
  translatedText: string;
  voiceId: string;
  speed: number;
  provider: 'elevenlabs' | 'azure';
  totalChapters: number;
  completedSoFar: number;
}

@Injectable()
export class TtsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TtsProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly gateway: TtsGateway,
    private readonly elevenlabs: ElevenLabsProvider,
    private readonly azure: AzureProvider,
  ) {}

  onModuleInit(): void {
    try {
      const redisConn = getRedisConnection();
      this.logger.log(`Starting TTS Worker — Redis at ${redisConn.host}:${redisConn.port}`);

      this.worker = new Worker(
        TTS_QUEUE,
        async (job: Job<TtsJobData>) => {
          this.logger.log(`🔊 Processing TTS job ${job.id}: chapter ${job.data.chapterNumber}`);
          await this.processChapter(job);
        },
        {
          connection: redisConn,
          concurrency: parseInt(process.env.TTS_MAX_CONCURRENT_JOBS || '2'),
          stalledInterval: 300000,
          lockDuration: 900000,
        },
      );

      this.worker.on('ready', () => this.logger.log('✅ TTS Worker is READY'));
      this.worker.on('failed', (job, err) => this.logger.error(`❌ TTS job ${job?.id} FAILED: ${err.message}`));
      this.worker.on('completed', (job) => this.logger.log(`✅ TTS job ${job.id} COMPLETED`));
      this.worker.on('error', (err) => this.logger.error(`❌ TTS Worker error: ${err.message}`));
    } catch (err) {
      this.logger.error(`❌ TTS worker init FAILED: ${err instanceof Error ? err.stack : err}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.logger.log('TTS Worker closed');
    }
  }

  private getProvider(name: string): TtsProvider {
    return name === 'azure' ? this.azure : this.elevenlabs;
  }

  async processChapter(job: Job<TtsJobData>): Promise<void> {
    const {
      audioBookId, audioChapterId, bookId, chapterNumber,
      translatedText, voiceId, speed,
      provider: providerName, totalChapters, completedSoFar,
    } = job.data;

    const provider = this.getProvider(providerName);

    // Mark chapter as GENERATING
    await this.prisma.audioChapter.update({
      where: { id: audioChapterId },
      data: { status: 'GENERATING' },
    });

    // Mark book as IN_PROGRESS if first chapter
    if (completedSoFar === 0) {
      await this.prisma.audioBook.update({
        where: { id: audioBookId },
        data: { status: 'IN_PROGRESS', startedAt: new Date() },
      });
    }

    try {
      // 1. Chunk text
      const maxBytes = provider.getMaxChunkSize();
      const { chunks } = chunkText(translatedText, maxBytes);

      if (chunks.length === 0) {
        throw new Error('No text chunks generated — chapter may be empty');
      }

      // 2. Synthesize each chunk
      const audioBuffers: Buffer[] = [];
      const timestamps: Array<{ text: string; startMs: number; endMs: number }> = [];
      let cumulativeDuration = 0;

      for (let i = 0; i < chunks.length; i++) {
        const result = await provider.synthesize(chunks[i], {
          voiceId,
          speed,
          format: 'mp3',
          sampleRate: parseInt(process.env.TTS_AUDIO_SAMPLE_RATE || '24000'),
        });

        audioBuffers.push(result.audioBuffer);

        timestamps.push({
          text: chunks[i],
          startMs: cumulativeDuration,
          endMs: cumulativeDuration + result.durationMs,
        });
        cumulativeDuration += result.durationMs;

        // Emit chunk progress
        const chunkProgress = Math.round(((i + 1) / chunks.length) * 100);
        const overallProgress = Math.round(
          ((completedSoFar + (chunkProgress / 100)) / totalChapters) * 100,
        );
        this.gateway.emitProgress(audioBookId, {
          chapterNumber,
          chunkProgress,
          overallProgress,
        });

        await job.updateProgress(chunkProgress);
      }

      // 3. Concatenate audio
      const crossfadeMs = parseInt(process.env.TTS_CROSSFADE_MS || '50');
      const concatResult = await concatenateAudioBuffers(audioBuffers, {
        crossfadeMs: audioBuffers.length > 1 ? crossfadeMs : 0,
        format: process.env.TTS_AUDIO_FORMAT || 'mp3',
        bitrate: process.env.TTS_AUDIO_BITRATE || '128k',
        sampleRate: parseInt(process.env.TTS_AUDIO_SAMPLE_RATE || '24000'),
      });

      // 4. Upload to S3
      const s3Key = this.s3.generateAudioKey(bookId, audioBookId, chapterNumber);
      await this.s3.upload(s3Key, concatResult.buffer, 'audio/mpeg');

      // 5+6. Update AudioChapter + AudioBook atomically in a transaction
      const { newCompleted, isLast, bookUpdateData } = await this.prisma.$transaction(async (tx) => {
        await tx.audioChapter.update({
          where: { id: audioChapterId },
          data: {
            audioUrl: s3Key,
            duration: concatResult.durationMs,
            fileSize: concatResult.fileSize,
            status: 'COMPLETED',
            timestamps: timestamps,
          },
        });

        const completed = await tx.audioChapter.count({
          where: { audioBookId, status: 'COMPLETED' },
        });
        const progress = Math.round((completed / totalChapters) * 100);
        const last = completed === totalChapters;

        const data: Record<string, unknown> = {
          completedChapters: completed,
          progress,
        };

        if (last) {
          const allCh = await tx.audioChapter.findMany({
            where: { audioBookId },
            select: { duration: true, fileSize: true },
          });
          data.totalDuration = allCh.reduce((sum, ch) => sum + (ch.duration || 0), 0);
          data.totalSize = allCh.reduce((sum, ch) => sum + (ch.fileSize || 0), 0);
          data.status = 'COMPLETED';
          data.completedAt = new Date();
        }

        await tx.audioBook.update({ where: { id: audioBookId }, data });

        return { newCompleted: completed, isLast: last, bookUpdateData: data };
      });

      // 7. Emit events
      const presignedUrl = await this.s3.getPresignedUrl(
        s3Key,
        parseInt(process.env.TTS_PRESIGNED_URL_EXPIRY || '14400'),
      );

      this.gateway.emitChapterDone(audioBookId, {
        chapterNumber,
        audioUrl: presignedUrl,
        duration: concatResult.durationMs,
      });

      if (isLast) {
        this.gateway.emitCompleted(audioBookId, {
          totalDuration: bookUpdateData.totalDuration as number,
          totalSize: bookUpdateData.totalSize as number,
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'TTS synthesis failed';
      this.logger.error(`TTS chapter ${chapterNumber} failed: ${errorMsg}`);

      await this.prisma.audioChapter.update({
        where: { id: audioChapterId },
        data: { status: 'FAILED' },
      });

      // Check remaining chapters
      const remaining = await this.prisma.audioChapter.count({
        where: { audioBookId, status: { in: ['PENDING', 'GENERATING'] } },
      });

      if (remaining === 0) {
        const completed = await this.prisma.audioChapter.count({
          where: { audioBookId, status: 'COMPLETED' },
        });
        await this.prisma.audioBook.update({
          where: { id: audioBookId },
          data: {
            status: completed > 0 ? 'PARTIAL' : 'FAILED',
            errorMessage: errorMsg,
          },
        });
      }

      this.gateway.emitError(audioBookId, { chapterNumber, error: 'აუდიოს გენერაცია ვერ მოხერხდა' });
      throw error;
    }
  }
}
