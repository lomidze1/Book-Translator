import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
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

describe('TtsService — retry', () => {
  let service: TtsService;

  const mockPrisma = {
    book: { findUnique: vi.fn() },
    translation: { findFirst: vi.fn() },
    translatedChapter: { findFirst: vi.fn(), findMany: vi.fn() },
    audioBook: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    audioChapter: { update: vi.fn() },
  };

  const mockS3 = {};

  const mockProviderManager = {
    getProvider: vi.fn().mockReturnValue({ getVoices: vi.fn().mockResolvedValue([]) }),
  };

  const userId = 'user-1';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new (TtsService as any)(mockPrisma, mockS3, mockProviderManager);
  });

  it('should re-queue FAILED chapters only', async () => {
    mockPrisma.audioBook.findUnique.mockResolvedValue({
      id: 'ab-1',
      bookId: 'book-1',
      voiceId: 'v1',
      totalChapters: 3,
      completedChapters: 1,
      chapters: [
        { id: 'ac-3', chapterNumber: 3, status: 'FAILED' },
      ],
      book: { userBooks: [{ userId }] },
    });

    mockPrisma.translation.findFirst.mockResolvedValue({ id: 'tr-1' });
    mockPrisma.translatedChapter.findMany.mockResolvedValue([
      { translatedContent: 'text', chapter: { id: 'ch-3', number: 3 } },
    ]);

    const result = await service.retryFailed('ab-1', userId);

    expect(result.retriedChapters).toEqual([3]);
    expect(result.queued).toBe(1);
    expect(result.status).toBe('queued');
    expect(mockPrisma.audioChapter.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PENDING' } }),
    );
    expect(mockPrisma.audioBook.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'IN_PROGRESS' }) }),
    );
  });

  it('should return empty when no failed chapters', async () => {
    mockPrisma.audioBook.findUnique.mockResolvedValue({
      id: 'ab-1',
      bookId: 'book-1',
      voiceId: 'v1',
      chapters: [],
      book: { userBooks: [{ userId }] },
    });

    const result = await service.retryFailed('ab-1', userId);
    expect(result.retriedChapters).toEqual([]);
    expect(result.status).toBe('no_failures');
  });

  it('should throw NotFoundException when audioBook not found', async () => {
    mockPrisma.audioBook.findUnique.mockResolvedValue(null);

    await expect(
      service.retryFailed('nonexistent', userId),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException when user does not own book', async () => {
    mockPrisma.audioBook.findUnique.mockResolvedValue({
      id: 'ab-1',
      chapters: [],
      book: { userBooks: [] },
    });

    await expect(
      service.retryFailed('ab-1', userId),
    ).rejects.toThrow(ForbiddenException);
  });
});
