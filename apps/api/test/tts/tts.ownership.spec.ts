import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TtsService } from '../../src/tts/tts.service';

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({ add: vi.fn() })),
}));

describe('TTS Ownership & Authorization', () => {
  let service: TtsService;

  const mockPrisma = {
    book: { findUnique: vi.fn() },
    translation: { findFirst: vi.fn() },
    translatedChapter: { findFirst: vi.fn(), findMany: vi.fn() },
    audioBook: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
    audioChapter: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), upsert: vi.fn() },
  };
  const mockS3 = { getPresignedUrl: vi.fn(), delete: vi.fn() };
  const mockElevenlabs = { getVoices: vi.fn().mockResolvedValue([]) };
  const mockAzure = { getVoices: vi.fn().mockResolvedValue([]) };

  const userA = 'user-A';
  const userB = 'user-B';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new (TtsService as any)(mockPrisma, mockS3, mockElevenlabs, mockAzure);
  });

  it('user should not synthesize book they do not own', async () => {
    mockPrisma.book.findUnique.mockResolvedValue({ id: 'b1', userBooks: [] });
    await expect(service.synthesize(userA, { bookId: 'b1', chapterNumber: 1 }))
      .rejects.toThrow(ForbiddenException);
  });

  it('user should not synthesize book with no completed translation', async () => {
    mockPrisma.book.findUnique.mockResolvedValue({ id: 'b1', userBooks: [{ userId: userA }] });
    mockPrisma.translation.findFirst.mockResolvedValue(null);
    await expect(service.synthesize(userA, { bookId: 'b1', chapterNumber: 1 }))
      .rejects.toThrow(NotFoundException);
  });

  it('user A should NOT access user B audiobook status', async () => {
    mockPrisma.audioBook.findUnique.mockResolvedValue({
      id: 'ab-1', chapters: [],
      book: { userBooks: [] }, // User A not in userBooks
    });
    await expect(service.getAudioBookStatus('ab-1', userA))
      .rejects.toThrow(ForbiddenException);
  });

  it('user A should NOT delete user B audiobook', async () => {
    mockPrisma.audioBook.findUnique.mockResolvedValue({
      id: 'ab-1', chapters: [],
      book: { userBooks: [] },
    });
    await expect(service.deleteAudioBook('ab-1', userA))
      .rejects.toThrow(ForbiddenException);
  });

  it('user A should NOT stream user B audio chapter', async () => {
    mockPrisma.audioChapter.findUnique.mockResolvedValue({
      id: 'ac-1', audioUrl: 'key',
      audioBook: { book: { userBooks: [] } },
    });
    await expect(service.getStreamUrl('ac-1', userA))
      .rejects.toThrow(ForbiddenException);
  });

  it('user who owns book should be able to synthesize', async () => {
    mockPrisma.book.findUnique.mockResolvedValue({ id: 'b1', userBooks: [{ userId: userA }] });
    mockPrisma.translation.findFirst.mockResolvedValue({ id: 'tr-1', bookId: 'b1', status: 'COMPLETED' });
    mockPrisma.audioBook.findFirst.mockResolvedValue(null);
    mockPrisma.audioBook.create.mockResolvedValue({ id: 'ab-new', totalChapters: 1, completedChapters: 0 });
    mockPrisma.audioChapter.findFirst.mockResolvedValue(null);
    mockPrisma.translatedChapter.findFirst.mockResolvedValue({
      translatedContent: 'ტექსტი', chapter: { id: 'ch-1', number: 1 },
    });
    mockPrisma.audioChapter.upsert.mockResolvedValue({ id: 'ac-1' });

    const result = await service.synthesize(userA, { bookId: 'b1', chapterNumber: 1 });
    expect(result.status).toBe('queued');
  });
});
