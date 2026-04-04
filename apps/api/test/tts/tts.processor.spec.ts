import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TtsProcessor, TtsJobData } from '../../src/tts/tts.processor';

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(() => ({ on: vi.fn() })),
  Job: vi.fn(),
}));

describe('TtsProcessor', () => {
  let processor: TtsProcessor;

  const mockPrisma = {
    audioChapter: {
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    audioBook: {
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  const mockS3 = {
    generateAudioKey: vi.fn().mockReturnValue('books/b1/audio/ab1/ch-1.mp3'),
    upload: vi.fn().mockResolvedValue('books/b1/audio/ab1/ch-1.mp3'),
    getPresignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/audio.mp3'),
  };

  const mockGateway = {
    emitProgress: vi.fn(),
    emitChapterDone: vi.fn(),
    emitCompleted: vi.fn(),
    emitError: vi.fn(),
  };

  const mockDefaultProvider = {
    synthesize: vi.fn().mockResolvedValue({ audioBuffer: Buffer.from('audio'), durationMs: 5000 }),
    getMaxChunkSize: vi.fn().mockReturnValue(4500),
    getName: vi.fn().mockReturnValue('elevenlabs'),
  };

  const mockProviderManager = {
    getProvider: vi.fn().mockReturnValue(mockDefaultProvider),
  };

  const createMockJob = (data: Partial<TtsJobData> = {}) => ({
    data: {
      audioBookId: 'ab-1',
      audioChapterId: 'ac-1',
      bookId: 'book-1',
      chapterId: 'ch-1',
      chapterNumber: 1,
      translatedText: 'ეს არის ტესტი.',
      voiceId: 'voice-1',
      speed: 1.0,
      provider: 'elevenlabs' as const,
      totalChapters: 3,
      completedSoFar: 0,
      ...data,
    },
    id: 'job-1',
    updateProgress: vi.fn().mockResolvedValue(undefined),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new (TtsProcessor as any)(
      mockPrisma, mockS3, mockGateway, mockProviderManager,
    );

    // Default: single chunk, successful synthesis
    mockPrisma.audioChapter.findMany.mockResolvedValue([
      { duration: 5000, fileSize: 5000 },
    ]);
    // Default: 1 completed chapter after processing (used by race-safe progress tracking)
    mockPrisma.audioChapter.count.mockResolvedValue(1);

    // $transaction executes the callback with the same mock prisma (acting as tx)
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
      return fn(mockPrisma);
    });
  });

  describe('processChapter', () => {
    it('should call TTS provider synthesize for each chunk', async () => {
      const job = createMockJob();
      await (processor as any).processChapter(job);
      expect(mockDefaultProvider.synthesize).toHaveBeenCalled();
    });

    it('should upload final audio to S3 with correct key', async () => {
      const job = createMockJob();
      await (processor as any).processChapter(job);
      expect(mockS3.upload).toHaveBeenCalledWith(
        'books/b1/audio/ab1/ch-1.mp3',
        expect.anything(),
        'audio/mpeg',
      );
    });

    it('should update AudioChapter with audioUrl, duration, fileSize, status COMPLETED', async () => {
      const job = createMockJob();
      await (processor as any).processChapter(job);
      // Second call is the COMPLETED update (first is GENERATING)
      const completedCall = mockPrisma.audioChapter.update.mock.calls.find(
        (c: any) => c[0].data.status === 'COMPLETED',
      );
      expect(completedCall).toBeDefined();
      expect(completedCall[0].data.audioUrl).toBeDefined();
    });

    it('should update AudioChapter timestamps JSON', async () => {
      const job = createMockJob();
      await (processor as any).processChapter(job);
      const updateCall = mockPrisma.audioChapter.update.mock.calls.find(
        (c: any) => c[0].data.timestamps,
      );
      expect(updateCall).toBeDefined();
      expect(updateCall[0].data.timestamps).toBeInstanceOf(Array);
    });

    it('should update AudioBook progress after chapter completes', async () => {
      mockPrisma.audioChapter.count.mockResolvedValue(1); // 1 completed out of 3
      const job = createMockJob({ totalChapters: 3 });
      await (processor as any).processChapter(job);
      expect(mockPrisma.audioBook.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ab-1' },
          data: expect.objectContaining({ completedChapters: 1 }),
        }),
      );
    });

    it('should mark AudioBook as COMPLETED when last chapter finishes', async () => {
      mockPrisma.audioChapter.count.mockResolvedValue(3); // all 3 completed
      const job = createMockJob({ totalChapters: 3 });
      mockPrisma.audioChapter.findMany.mockResolvedValue([
        { duration: 5000, fileSize: 5000 },
        { duration: 6000, fileSize: 6000 },
        { duration: 7000, fileSize: 7000 },
      ]);
      await (processor as any).processChapter(job);

      const bookUpdate = mockPrisma.audioBook.update.mock.calls.find(
        (c: any) => c[0].data.status === 'COMPLETED',
      );
      expect(bookUpdate).toBeDefined();
    });

    it('should calculate totalDuration and totalSize on completion', async () => {
      mockPrisma.audioChapter.count.mockResolvedValue(3);
      const job = createMockJob({ totalChapters: 3 });
      mockPrisma.audioChapter.findMany.mockResolvedValue([
        { duration: 5000, fileSize: 5000 },
        { duration: 6000, fileSize: 6000 },
        { duration: 7000, fileSize: 7000 },
      ]);
      await (processor as any).processChapter(job);

      const bookUpdate = mockPrisma.audioBook.update.mock.calls.find(
        (c: any) => c[0].data.totalDuration,
      );
      expect(bookUpdate[0].data.totalDuration).toBe(18000);
      expect(bookUpdate[0].data.totalSize).toBe(18000);
    });

    it('should emit WebSocket progress events per chunk', async () => {
      const job = createMockJob();
      await (processor as any).processChapter(job);
      expect(mockGateway.emitProgress).toHaveBeenCalled();
    });

    it('should emit chapter-done event after chapter completes', async () => {
      const job = createMockJob();
      await (processor as any).processChapter(job);
      expect(mockGateway.emitChapterDone).toHaveBeenCalledWith('ab-1', expect.objectContaining({
        chapterNumber: 1,
        audioUrl: expect.any(String),
      }));
    });

    it('should emit completed event when all chapters done', async () => {
      mockPrisma.audioChapter.count.mockResolvedValue(3); // all done
      const job = createMockJob({ totalChapters: 3 });
      mockPrisma.audioChapter.findMany.mockResolvedValue([
        { duration: 5000, fileSize: 5000 },
      ]);
      await (processor as any).processChapter(job);
      expect(mockGateway.emitCompleted).toHaveBeenCalled();
    });

    it('should mark AudioChapter as FAILED if provider throws', async () => {
      mockDefaultProvider.synthesize.mockRejectedValue(new Error('Provider error'));
      mockPrisma.audioChapter.count.mockResolvedValue(0);
      const job = createMockJob();

      await expect((processor as any).processChapter(job)).rejects.toThrow('Provider error');

      const failUpdate = mockPrisma.audioChapter.update.mock.calls.find(
        (c: any) => c[0].data.status === 'FAILED',
      );
      expect(failUpdate).toBeDefined();
    });

    it('should mark AudioBook as FAILED if no chapters succeeded', async () => {
      mockDefaultProvider.synthesize.mockRejectedValue(new Error('Error'));
      mockPrisma.audioChapter.count
        .mockResolvedValueOnce(0) // remaining
        .mockResolvedValueOnce(0); // completed
      const job = createMockJob();

      await expect((processor as any).processChapter(job)).rejects.toThrow();

      const bookUpdate = mockPrisma.audioBook.update.mock.calls.find(
        (c: any) => c[0].data.status === 'FAILED',
      );
      expect(bookUpdate).toBeDefined();
    });

    it('should mark AudioBook as PARTIAL if some chapters succeeded', async () => {
      mockDefaultProvider.synthesize.mockRejectedValue(new Error('Error'));
      mockPrisma.audioChapter.count
        .mockResolvedValueOnce(0)  // remaining
        .mockResolvedValueOnce(2); // completed
      const job = createMockJob();

      await expect((processor as any).processChapter(job)).rejects.toThrow();

      const bookUpdate = mockPrisma.audioBook.update.mock.calls.find(
        (c: any) => c[0].data.status === 'PARTIAL',
      );
      expect(bookUpdate).toBeDefined();
    });

    it('should emit error event on failure', async () => {
      mockDefaultProvider.synthesize.mockRejectedValue(new Error('Error'));
      mockPrisma.audioChapter.count.mockResolvedValue(0);
      const job = createMockJob();

      await expect((processor as any).processChapter(job)).rejects.toThrow();
      expect(mockGateway.emitError).toHaveBeenCalledWith('ab-1', expect.objectContaining({
        chapterNumber: 1,
        error: expect.any(String),
      }));
    });

    it('should call job.updateProgress per chunk', async () => {
      mockDefaultProvider.synthesize.mockResolvedValue({ audioBuffer: Buffer.from('audio'), durationMs: 5000 });
      const job = createMockJob();
      await (processor as any).processChapter(job);
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should mark book as IN_PROGRESS on first chapter', async () => {
      mockDefaultProvider.synthesize.mockResolvedValue({ audioBuffer: Buffer.from('audio'), durationMs: 5000 });
      const job = createMockJob({ completedSoFar: 0 });
      await (processor as any).processChapter(job);

      const bookUpdate = mockPrisma.audioBook.update.mock.calls.find(
        (c: any) => c[0].data.status === 'IN_PROGRESS',
      );
      expect(bookUpdate).toBeDefined();
    });

    it('should use azure provider when specified', async () => {
      const mockAzureProvider = {
        synthesize: vi.fn().mockResolvedValue({ audioBuffer: Buffer.from('audio'), durationMs: 3000 }),
        getMaxChunkSize: vi.fn().mockReturnValue(8000),
        getName: vi.fn().mockReturnValue('azure'),
      };
      mockProviderManager.getProvider.mockReturnValue(mockAzureProvider);

      const job = createMockJob({ provider: 'azure' });
      await (processor as any).processChapter(job);

      expect(mockProviderManager.getProvider).toHaveBeenCalledWith('azure');
      expect(mockAzureProvider.synthesize).toHaveBeenCalled();

      // Restore default provider for other tests
      mockProviderManager.getProvider.mockReturnValue(mockDefaultProvider);
    });
  });
});
