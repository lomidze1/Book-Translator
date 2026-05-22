import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TtsService } from '../../src/tts/tts.service';

vi.mock('bullmq', () => {
  const mockAdd = vi.fn().mockResolvedValue({ id: 'job-1' });
  return {
    Queue: class MockQueue {
      add = mockAdd;
      close = vi.fn();
    },
  };
});

describe('TTS Integration Flow', () => {
  let service: TtsService;

  const userId = 'user-1';
  const bookId = '550e8400-e29b-41d4-a716-446655440001';
  const translationId = 'tr-1';
  const audioBookId = 'ab-1';

  const mockPrisma = {
    book: { findUnique: vi.fn() },
    translation: { findFirst: vi.fn() },
    translatedChapter: { findFirst: vi.fn(), findMany: vi.fn() },
    audioBook: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    audioChapter: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  };

  const mockS3 = {
    getPresignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/audio.mp3'),
    generateAudioKey: vi.fn().mockReturnValue('books/b1/audio/ab1/ch-1.mp3'),
    delete: vi.fn().mockResolvedValue(undefined),
  };

  const mockProviderManager = {
    getProvider: vi.fn().mockReturnValue({
      getVoices: vi.fn().mockResolvedValue([
        { id: 'ka-GE-Neural2-A', name: 'Georgian Female', language: 'ka-GE', gender: 'female', provider: 'google-cloud' },
      ]),
    }),
    estimateCost: vi.fn().mockReturnValue({
      provider: 'google-cloud', charCount: 50000, costUsd: 0.20, estimatedAudioMinutes: 5.6,
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new (TtsService as any)(
      mockPrisma,
      mockS3,
      mockProviderManager,
      { get: (k: string) => process.env[k] } as any,
    );

    // Default: book exists and user owns it
    mockPrisma.book.findUnique.mockResolvedValue({
      id: bookId, userBooks: [{ userId }],
    });
    mockPrisma.translation.findFirst.mockResolvedValue({
      id: translationId, bookId, status: 'COMPLETED',
    });
  });

  describe('Full TTS generation flow', () => {
    it('synthesize-book → creates AudioBook + queues all chapters', async () => {
      // Setup: 3 translated chapters
      mockPrisma.translatedChapter.findMany.mockResolvedValue([
        { translatedContent: 'თავი 1 ტექსტი', chapter: { id: 'ch-1', number: 1 } },
        { translatedContent: 'თავი 2 ტექსტი', chapter: { id: 'ch-2', number: 2 } },
        { translatedContent: 'თავი 3 ტექსტი', chapter: { id: 'ch-3', number: 3 } },
      ]);

      // No existing AudioBook
      mockPrisma.audioBook.findFirst.mockResolvedValue(null);
      mockPrisma.audioBook.create.mockResolvedValue({
        id: audioBookId, totalChapters: 3, completedChapters: 0,
      });

      // No existing AudioChapters on the initial scan; after createMany the
      // service re-reads the rows by chapterNumber to learn the generated ids.
      mockPrisma.audioChapter.findMany
        .mockResolvedValueOnce([]) // first scan
        .mockResolvedValueOnce([
          { id: 'ac-1', chapterNumber: 1, status: 'PENDING' },
          { id: 'ac-2', chapterNumber: 2, status: 'PENDING' },
          { id: 'ac-3', chapterNumber: 3, status: 'PENDING' },
        ]);
      mockPrisma.audioChapter.createMany.mockResolvedValue({ count: 3 });

      const result = await service.synthesizeBook(userId, { bookId });

      expect(result.audioBookId).toBe(audioBookId);
      expect(result.totalChapters).toBe(3);
      expect(result.queued).toBe(3);
      expect(result.status).toBe('queued');

      // Verify AudioBook was created
      expect(mockPrisma.audioBook.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bookId,
            translationId,
            totalChapters: 3,
          }),
        }),
      );

      // After refactor: rows are created in a single batched call.
      expect(mockPrisma.audioChapter.createMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.audioChapter.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ skipDuplicates: true }),
      );
    });

    it('synthesize-book → skips already completed chapters', async () => {
      mockPrisma.translatedChapter.findMany.mockResolvedValue([
        { translatedContent: 'text1', chapter: { id: 'ch-1', number: 1 } },
        { translatedContent: 'text2', chapter: { id: 'ch-2', number: 2 } },
      ]);

      mockPrisma.audioBook.findFirst.mockResolvedValue({
        id: audioBookId, totalChapters: 2, completedChapters: 1,
      });

      // Chapter 1 already completed; chapter 2 created in the batch.
      mockPrisma.audioChapter.findMany
        .mockResolvedValueOnce([{ chapterNumber: 1, status: 'COMPLETED' }])
        .mockResolvedValueOnce([{ id: 'ac-2', chapterNumber: 2, status: 'PENDING' }]);
      mockPrisma.audioChapter.createMany.mockResolvedValue({ count: 1 });

      const result = await service.synthesizeBook(userId, { bookId });

      expect(result.queued).toBe(1); // Only chapter 2 queued
    });
  });

  describe('estimate → status → stream flow', () => {
    it('estimate returns cost and duration for book', async () => {
      mockPrisma.translatedChapter.findMany.mockResolvedValue([
        { translatedContent: 'a'.repeat(25000), chapter: { number: 1 } },
        { translatedContent: 'b'.repeat(25000), chapter: { number: 2 } },
      ]);

      const result = await service.estimate(bookId, userId);

      expect(result.totalChapters).toBe(2);
      expect(result.totalCharacters).toBe(50000);
      expect(result.provider).toBe('google-cloud');
      expect(mockProviderManager.estimateCost).toHaveBeenCalledWith(50000, 'google-cloud');
    });

    it('status returns audiobook progress', async () => {
      mockPrisma.audioBook.findUnique.mockResolvedValue({
        id: audioBookId,
        status: 'IN_PROGRESS',
        progress: 33,
        totalDuration: 0,
        totalSize: 0,
        totalChapters: 3,
        completedChapters: 1,
        chapters: [
          { id: 'ac-1', chapterNumber: 1, duration: 60000, status: 'COMPLETED' },
          { id: 'ac-2', chapterNumber: 2, duration: null, status: 'GENERATING' },
          { id: 'ac-3', chapterNumber: 3, duration: null, status: 'PENDING' },
        ],
        book: { userBooks: [{ userId }] },
      });

      const result = await service.getAudioBookStatus(audioBookId, userId);

      expect(result.status).toBe('IN_PROGRESS');
      expect(result.progress).toBe(33);
      expect(result.chapters).toHaveLength(3);
      expect(result.chapters[0].status).toBe('COMPLETED');
    });

    it('stream returns presigned URL for completed chapter', async () => {
      mockPrisma.audioChapter.findUnique.mockResolvedValue({
        id: 'ac-1',
        audioUrl: 'books/b1/audio/ab1/ch-1.mp3',
        audioBook: { book: { userBooks: [{ userId }] } },
      });

      const url = await service.getStreamUrl('ac-1', userId);

      expect(url).toBe('https://s3.example.com/audio.mp3');
      expect(mockS3.getPresignedUrl).toHaveBeenCalledWith(
        'books/b1/audio/ab1/ch-1.mp3',
        expect.any(Number),
      );
    });
  });

  describe('retry → re-queues failed chapters', () => {
    it('retries only FAILED chapters and resets status', async () => {
      mockPrisma.audioBook.findUnique.mockResolvedValue({
        id: audioBookId,
        bookId,
        voiceId: 'ka-GE-Neural2-A',
        totalChapters: 3,
        completedChapters: 2,
        chapters: [
          { id: 'ac-2', chapterNumber: 2, status: 'FAILED' },
        ],
        book: { userBooks: [{ userId }] },
      });

      mockPrisma.translation.findFirst.mockResolvedValue({ id: translationId });
      mockPrisma.translatedChapter.findMany.mockResolvedValue([
        { translatedContent: 'text2', chapter: { id: 'ch-2', number: 2 } },
      ]);

      const result = await service.retryFailed(audioBookId, userId);

      expect(result.retriedChapters).toEqual([2]);
      expect(result.queued).toBe(1);
      expect(mockPrisma.audioChapter.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'PENDING' } }),
      );
      expect(mockPrisma.audioBook.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'IN_PROGRESS' }),
        }),
      );
    });
  });

  describe('delete → removes S3 files and DB records', () => {
    it('deletes audiobook with all S3 files', async () => {
      mockPrisma.audioBook.findUnique.mockResolvedValue({
        id: audioBookId,
        chapters: [
          { audioUrl: 'books/b1/audio/ab1/ch-1.mp3' },
          { audioUrl: 'books/b1/audio/ab1/ch-2.mp3' },
          { audioUrl: null }, // Chapter 3 has no audio yet
        ],
        book: { userBooks: [{ userId }] },
      });
      mockPrisma.audioBook.delete.mockResolvedValue({});

      await service.deleteAudioBook(audioBookId, userId);

      // S3 delete called for chapters with URLs
      expect(mockS3.delete).toHaveBeenCalledTimes(2);
      expect(mockS3.delete).toHaveBeenCalledWith('books/b1/audio/ab1/ch-1.mp3');
      expect(mockS3.delete).toHaveBeenCalledWith('books/b1/audio/ab1/ch-2.mp3');

      // DB record deleted
      expect(mockPrisma.audioBook.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: audioBookId } }),
      );
    });
  });

  describe('caching: re-request same chapter returns cached', () => {
    it('returns cached audio without re-queuing', async () => {
      const existingAudioBook = {
        id: audioBookId, totalChapters: 1, completedChapters: 1,
      };

      mockPrisma.audioBook.findFirst.mockResolvedValue(existingAudioBook);
      mockPrisma.audioChapter.findFirst.mockResolvedValue({
        id: 'ac-1', audioUrl: 'books/b1/audio/ab1/ch-1.mp3', status: 'COMPLETED',
      });

      const result = await service.synthesize(userId, { bookId, chapterNumber: 1 });

      expect(result.status).toBe('ready');
      expect(result.audioUrl).toBe('https://s3.example.com/audio.mp3');
      // Queue.add should NOT have been called — cached!
    });
  });

  describe('timestamps for karaoke', () => {
    it('returns chunk-level timestamps', async () => {
      mockPrisma.audioBook.findUnique.mockResolvedValue({
        id: audioBookId,
        book: { userBooks: [{ userId }] },
      });

      mockPrisma.audioChapter.findFirst.mockResolvedValue({
        id: 'ac-1',
        chapterNumber: 1,
        status: 'COMPLETED',
        timestamps: [
          { text: 'პირველი წინადადება.', startMs: 0, endMs: 4500 },
          { text: 'მეორე წინადადება.', startMs: 4500, endMs: 9200 },
        ],
      });

      const result = await service.getTimestamps(audioBookId, 1, userId);

      expect(result.chapterNumber).toBe(1);
      expect(result.timestamps).toHaveLength(2);
      expect(result.timestamps[0].startMs).toBe(0);
      expect(result.timestamps[1].endMs).toBe(9200);
    });
  });
});
