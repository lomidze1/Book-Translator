import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { TtsService } from '../../src/tts/tts.service';

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  })),
}));

describe('TtsService — estimate', () => {
  let service: TtsService;

  const mockPrisma = {
    book: { findUnique: vi.fn() },
    translation: { findFirst: vi.fn() },
    translatedChapter: { findMany: vi.fn() },
    audioBook: {},
    audioChapter: {},
  };

  const mockS3 = {};
  const mockProviderManager = {
    getProvider: vi.fn().mockReturnValue({ getVoices: vi.fn().mockResolvedValue([]) }),
    estimateCost: vi.fn().mockImplementation((charCount: number, provider?: string) => {
      const costPerMillion: Record<string, number> = { 'google-cloud': 4, elevenlabs: 5, azure: 4 };
      const p = provider || 'google-cloud';
      return {
        provider: p,
        charCount,
        costUsd: Math.round((charCount / 1_000_000) * (costPerMillion[p] || 4) * 100) / 100,
        estimatedAudioMinutes: Math.round((charCount / 150 / 60) * 10) / 10,
      };
    }),
  };

  const userId = 'user-1';
  const bookId = 'book-1';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TTS_PRIMARY_PROVIDER = 'google-cloud';
    service = new (TtsService as any)(mockPrisma, mockS3, mockProviderManager);

    mockPrisma.book.findUnique.mockResolvedValue({
      id: bookId,
      userBooks: [{ userId }],
    });
    mockPrisma.translation.findFirst.mockResolvedValue({
      id: 'tr-1',
      bookId,
      status: 'COMPLETED',
    });
  });

  it('should calculate cost for google-cloud', async () => {
    mockPrisma.translatedChapter.findMany.mockResolvedValue([
      { translatedContent: 'a'.repeat(100000), chapter: { number: 1 } },
      { translatedContent: 'b'.repeat(145000), chapter: { number: 2 } },
    ]);

    const result = await service.estimate(bookId, userId, 'google-cloud');

    expect(result.totalChapters).toBe(2);
    expect(result.totalCharacters).toBe(245000);
    expect(result.estimatedCostUsd).toBe(0.98); // 245000 / 1M * $4
    expect(result.provider).toBe('google-cloud');
    expect(result.estimatedAudioMinutes).toBeGreaterThan(0);
    expect(result.estimatedAudioHours).toBeGreaterThan(0);
  });

  it('should calculate cost for elevenlabs', async () => {
    mockPrisma.translatedChapter.findMany.mockResolvedValue([
      { translatedContent: 'a'.repeat(1000000), chapter: { number: 1 } },
    ]);

    const result = await service.estimate(bookId, userId, 'elevenlabs');

    expect(result.estimatedCostUsd).toBe(5); // 1M / 1M * $5
    expect(result.provider).toBe('elevenlabs');
  });

  it('should throw when no completed translation', async () => {
    mockPrisma.translation.findFirst.mockResolvedValue(null);

    await expect(
      service.estimate(bookId, userId),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw when no translated chapters', async () => {
    mockPrisma.translatedChapter.findMany.mockResolvedValue([]);

    await expect(
      service.estimate(bookId, userId),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException for non-owner', async () => {
    mockPrisma.book.findUnique.mockResolvedValue({
      id: bookId,
      userBooks: [],
    });

    await expect(
      service.estimate(bookId, userId),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should use default provider when not specified', async () => {
    mockPrisma.translatedChapter.findMany.mockResolvedValue([
      { translatedContent: 'text', chapter: { number: 1 } },
    ]);

    const result = await service.estimate(bookId, userId);
    expect(result.provider).toBe('google-cloud');
  });
});
