import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { TtsService } from '../../src/tts/tts.service';

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  })),
}));

describe('TtsService', () => {
  let service: TtsService;

  const mockPrisma = {
    book: { findUnique: vi.fn() },
    translation: { findFirst: vi.fn() },
    translatedChapter: { findFirst: vi.fn(), findMany: vi.fn() },
    audioBook: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), update: vi.fn() },
    audioChapter: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
  };

  const mockS3 = {
    getPresignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/audio.mp3'),
    generateAudioKey: vi.fn().mockReturnValue('books/b1/audio/ab1/ch-1.mp3'),
    delete: vi.fn().mockResolvedValue(undefined),
  };

  const mockElevenlabs = {
    getVoices: vi.fn().mockResolvedValue([{ id: 'v1', name: 'Ka Voice', language: 'ka', gender: 'female', provider: 'elevenlabs' }]),
  };

  const mockProviderManager = {
    getProvider: vi.fn().mockReturnValue({
      getVoices: vi.fn().mockResolvedValue([{ id: 'ka-GE-Neural2-A', name: 'Georgian Neural2 A', language: 'ka-GE', gender: 'female', provider: 'google-cloud' }]),
    }),
    estimateCost: vi.fn().mockReturnValue({ provider: 'google-cloud', charCount: 1000, costUsd: 0.01, estimatedAudioMinutes: 1 }),
  };

  const userId = 'user-1';
  const bookId = 'book-1';

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
      id: 'tr-1', bookId, status: 'COMPLETED',
    });
  });

  describe('getAudioUrl', () => {
    it('should return presigned URL for completed chapter', async () => {
      mockPrisma.audioChapter.findFirst.mockResolvedValue({ id: 'ac-1', audioUrl: 'key' });

      const result = await service.getAudioUrl(bookId, 1, userId);

      expect(result).toBe('https://s3.example.com/audio.mp3');
      expect(mockS3.getPresignedUrl).toHaveBeenCalledWith('key', expect.any(Number));
    });

    it('should return null when no completed chapter', async () => {
      mockPrisma.audioChapter.findFirst.mockResolvedValue(null);

      const result = await service.getAudioUrl(bookId, 1, userId);

      expect(result).toBeNull();
    });

    it('should return null when audioUrl is null', async () => {
      mockPrisma.audioChapter.findFirst.mockResolvedValue({ id: 'ac-1', audioUrl: null });

      const result = await service.getAudioUrl(bookId, 1, userId);

      expect(result).toBeNull();
    });

    it('should validate book ownership', async () => {
      mockPrisma.book.findUnique.mockResolvedValue({ id: bookId, userBooks: [] });

      await expect(service.getAudioUrl(bookId, 1, userId))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('listAudioChapters', () => {
    it('should return mapped chapter list', async () => {
      mockPrisma.audioBook.findFirst.mockResolvedValue({
        id: 'ab-1',
        chapters: [
          { id: 'ac-1', chapterNumber: 1, duration: 5000, fileSize: 5000, format: 'mp3', status: 'COMPLETED' },
          { id: 'ac-2', chapterNumber: 2, duration: null, fileSize: null, format: 'mp3', status: 'PENDING' },
        ],
      });

      const result = await service.listAudioChapters(bookId, userId);

      expect(result).toHaveLength(2);
      expect(result[0].audioChapterId).toBe('ac-1');
      expect(result[0].status).toBe('COMPLETED');
      expect(result[1].status).toBe('PENDING');
    });

    it('should return empty array when no audioBook exists', async () => {
      mockPrisma.audioBook.findFirst.mockResolvedValue(null);

      const result = await service.listAudioChapters(bookId, userId);

      expect(result).toEqual([]);
    });

    it('should validate book ownership', async () => {
      mockPrisma.book.findUnique.mockResolvedValue({ id: bookId, userBooks: [] });

      await expect(service.listAudioChapters(bookId, userId))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('synthesize (single chapter)', () => {
    const dto = { bookId, chapterNumber: 1 };

    it('should create AudioBook if not exists', async () => {
      mockPrisma.audioBook.findFirst.mockResolvedValue(null);
      mockPrisma.audioBook.create.mockResolvedValue({ id: 'ab-new', totalChapters: 1, completedChapters: 0 });
      mockPrisma.audioChapter.findFirst.mockResolvedValue(null);
      mockPrisma.translatedChapter.findFirst.mockResolvedValue({
        translatedContent: 'ტექსტი',
        chapter: { id: 'ch-1', number: 1 },
      });
      mockPrisma.audioChapter.upsert.mockResolvedValue({ id: 'ac-1' });

      const result = await service.synthesize(userId, dto);
      expect(mockPrisma.audioBook.create).toHaveBeenCalled();
      expect(result.status).toBe('queued');
    });

    it('should return existing audio URL if chapter already generated (caching)', async () => {
      mockPrisma.audioBook.findFirst.mockResolvedValue({ id: 'ab-1' });
      mockPrisma.audioChapter.findFirst.mockResolvedValue({ id: 'ac-1', audioUrl: 'key', status: 'COMPLETED' });

      const result = await service.synthesize(userId, dto);
      expect(result.status).toBe('ready');
      expect(result.audioUrl).toBeDefined();
    });

    it('should throw NotFoundException when book not found', async () => {
      mockPrisma.book.findUnique.mockResolvedValue(null);
      await expect(service.synthesize(userId, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when no completed translation', async () => {
      mockPrisma.translation.findFirst.mockResolvedValue(null);
      await expect(service.synthesize(userId, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user does not own book', async () => {
      mockPrisma.book.findUnique.mockResolvedValue({ id: bookId, userBooks: [] });
      await expect(service.synthesize(userId, dto)).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when translated chapter not found', async () => {
      mockPrisma.audioBook.findFirst.mockResolvedValue({ id: 'ab-1', totalChapters: 1, completedChapters: 0 });
      mockPrisma.audioChapter.findFirst.mockResolvedValue(null);
      mockPrisma.translatedChapter.findFirst.mockResolvedValue(null);

      await expect(service.synthesize(userId, dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('synthesizeBook', () => {
    const dto = { bookId };

    it('should create AudioBook with totalChapters count', async () => {
      mockPrisma.audioBook.findFirst.mockResolvedValue(null);
      mockPrisma.audioBook.create.mockResolvedValue({ id: 'ab-new', completedChapters: 0 });
      mockPrisma.translatedChapter.findMany.mockResolvedValue([
        { translatedContent: 'text1', chapter: { id: 'ch-1', number: 1 } },
        { translatedContent: 'text2', chapter: { id: 'ch-2', number: 2 } },
      ]);
      mockPrisma.audioChapter.findMany.mockResolvedValue([]);
      mockPrisma.audioChapter.upsert.mockResolvedValue({ id: 'ac-1' });

      const result = await service.synthesizeBook(userId, dto);
      expect(result.totalChapters).toBe(2);
    });

    it('should throw NotFoundException when no translated chapters', async () => {
      mockPrisma.translatedChapter.findMany.mockResolvedValue([]);
      await expect(service.synthesizeBook(userId, dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getVoices', () => {
    it('should return voices from primary provider', async () => {
      const voices = await service.getVoices();
      expect(voices).toHaveLength(1);
      expect(voices[0].provider).toBe('google-cloud');
    });
  });

  describe('getAudioBookStatus', () => {
    it('should return status with chapters', async () => {
      mockPrisma.audioBook.findUnique.mockResolvedValue({
        id: 'ab-1', status: 'IN_PROGRESS', progress: 50,
        totalDuration: null, totalSize: null, totalChapters: 2, completedChapters: 1,
        chapters: [{ id: 'ac-1', chapterNumber: 1, duration: 5000, status: 'COMPLETED' }],
        book: { userBooks: [{ userId }] },
      });

      const result = await service.getAudioBookStatus('ab-1', userId);
      expect(result.status).toBe('IN_PROGRESS');
      expect(result.chapters).toHaveLength(1);
    });

    it('should throw NotFoundException for invalid audioBookId', async () => {
      mockPrisma.audioBook.findUnique.mockResolvedValue(null);
      await expect(service.getAudioBookStatus('invalid', userId)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for unauthorized user', async () => {
      mockPrisma.audioBook.findUnique.mockResolvedValue({
        id: 'ab-1', book: { userBooks: [] }, chapters: [],
      });
      await expect(service.getAudioBookStatus('ab-1', userId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getStreamUrl', () => {
    it('should return presigned URL for audio chapter', async () => {
      mockPrisma.audioChapter.findUnique.mockResolvedValue({
        id: 'ac-1', audioUrl: 'key',
        audioBook: { book: { userBooks: [{ userId }] } },
      });

      const url = await service.getStreamUrl('ac-1', userId);
      expect(url).toBe('https://s3.example.com/audio.mp3');
    });

    it('should throw NotFoundException for invalid audioChapterId', async () => {
      mockPrisma.audioChapter.findUnique.mockResolvedValue(null);
      await expect(service.getStreamUrl('invalid', userId)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for unauthorized user', async () => {
      mockPrisma.audioChapter.findUnique.mockResolvedValue({
        id: 'ac-1', audioUrl: 'key',
        audioBook: { book: { userBooks: [] } },
      });
      await expect(service.getStreamUrl('ac-1', userId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteAudioBook', () => {
    it('should delete S3 files and records', async () => {
      mockPrisma.audioBook.findUnique.mockResolvedValue({
        id: 'ab-1',
        chapters: [{ audioUrl: 'key1' }, { audioUrl: 'key2' }],
        book: { userBooks: [{ userId }] },
      });
      mockPrisma.audioBook.delete.mockResolvedValue({});

      await service.deleteAudioBook('ab-1', userId);
      expect(mockS3.delete).toHaveBeenCalledTimes(2);
      expect(mockPrisma.audioBook.delete).toHaveBeenCalledWith({ where: { id: 'ab-1' } });
    });

    it('should throw ForbiddenException for unauthorized user', async () => {
      mockPrisma.audioBook.findUnique.mockResolvedValue({
        id: 'ab-1', chapters: [],
        book: { userBooks: [] },
      });
      await expect(service.deleteAudioBook('ab-1', userId)).rejects.toThrow(ForbiddenException);
    });

    it('should handle partial cleanup (some S3 files missing)', async () => {
      mockS3.delete.mockRejectedValueOnce(new Error('Not found')).mockResolvedValueOnce(undefined);
      mockPrisma.audioBook.findUnique.mockResolvedValue({
        id: 'ab-1',
        chapters: [{ audioUrl: 'missing' }, { audioUrl: 'exists' }],
        book: { userBooks: [{ userId }] },
      });
      mockPrisma.audioBook.delete.mockResolvedValue({});

      await service.deleteAudioBook('ab-1', userId);
      expect(mockPrisma.audioBook.delete).toHaveBeenCalled();
    });
  });
});
