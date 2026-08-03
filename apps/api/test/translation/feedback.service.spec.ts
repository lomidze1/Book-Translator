import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { FeedbackService } from '../../src/translation/feedback.service';

describe('FeedbackService', () => {
  let service: FeedbackService;

  const mockPrisma = {
    translation: { findUnique: vi.fn() },
    translatedChapter: { findFirst: vi.fn() },
    translationFeedback: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  };

  const mockRetranslation = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const mockConfig = { get: vi.fn(() => undefined) };

  const dto = {
    chapterNumber: 1,
    startPosition: 100,
    endPosition: 140,
    selectedText: 'მან მიიღო გადაწყვეტილება',
    comment: 'კალკია, უნდა იყოს „გადაწყვიტა"',
  };

  const ownedTranslation = {
    id: 'tr-1',
    status: 'COMPLETED',
    book: { userBooks: [{ userId: 'user-1' }] },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.translation.findUnique.mockResolvedValue(ownedTranslation);
    mockPrisma.translatedChapter.findFirst.mockResolvedValue({ id: 'tc-1', chapterId: 'ch-1' });
    mockPrisma.translationFeedback.findFirst.mockResolvedValue(null);
    mockPrisma.translationFeedback.count.mockResolvedValue(0);
    mockPrisma.translationFeedback.create.mockImplementation(({ data }: any) => ({ id: 'fb-1', ...data }));
    mockPrisma.translationFeedback.update.mockImplementation(({ data }: any) => ({ id: 'fb-existing', ...data }));
    mockRetranslation.enqueue.mockResolvedValue(undefined);
    service = new FeedbackService(mockPrisma as any, mockRetranslation as any, mockConfig as any);
  });

  describe('create', () => {
    it('should store the report and queue a re-translation', async () => {
      const feedback = await service.create('tr-1', 'user-1', dto);

      expect(mockPrisma.translationFeedback.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          translationId: 'tr-1',
          chapterId: 'ch-1',
          userId: 'user-1',
          startPosition: 100,
          endPosition: 140,
          selectedText: dto.selectedText,
          comment: dto.comment,
        }),
      });
      expect(mockRetranslation.enqueue).toHaveBeenCalledWith('fb-1');
      expect(feedback.id).toBe('fb-1');
    });

    it('should reject a range that ends before it starts', async () => {
      await expect(
        service.create('tr-1', 'user-1', { ...dto, startPosition: 200, endPosition: 100 }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.translationFeedback.create).not.toHaveBeenCalled();
    });

    it('should reject a user who does not own the book', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue({
        ...ownedTranslation,
        book: { userBooks: [] },
      });

      await expect(service.create('tr-1', 'user-1', dto)).rejects.toThrow(ForbiddenException);
    });

    it('should reject feedback on a translation that is not finished', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue({
        ...ownedTranslation,
        status: 'IN_PROGRESS',
      });

      await expect(service.create('tr-1', 'user-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('should 404 for an unknown translation', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue(null);

      await expect(service.create('tr-1', 'user-1', dto)).rejects.toThrow(NotFoundException);
    });

    it('should 404 when the chapter has no translated text', async () => {
      mockPrisma.translatedChapter.findFirst.mockResolvedValue(null);

      await expect(service.create('tr-1', 'user-1', dto)).rejects.toThrow(NotFoundException);
    });

    it('should collapse a report that overlaps an existing pending one', async () => {
      mockPrisma.translationFeedback.findFirst.mockResolvedValue({
        id: 'fb-existing',
        reportCount: 1,
        status: 'PENDING',
      });

      await service.create('tr-1', 'user-2', dto);

      // Same passage, more readers — bump the counter, don't re-translate twice
      expect(mockPrisma.translationFeedback.create).not.toHaveBeenCalled();
      expect(mockPrisma.translationFeedback.update).toHaveBeenCalledWith({
        where: { id: 'fb-existing' },
        data: { reportCount: { increment: 1 } },
      });
      expect(mockRetranslation.enqueue).not.toHaveBeenCalled();
    });

    it('should refuse once the per-translation re-translation quota is spent', async () => {
      // First count() call is the quota check
      mockPrisma.translationFeedback.count.mockResolvedValueOnce(30);

      await expect(service.create('tr-1', 'user-1', dto)).rejects.toThrow('RETRANSLATION_QUOTA_EXCEEDED');
      expect(mockPrisma.translationFeedback.create).not.toHaveBeenCalled();
    });

    it('should refuse once the daily report limit is hit', async () => {
      mockPrisma.translationFeedback.count
        .mockResolvedValueOnce(0) // quota ok
        .mockResolvedValueOnce(20); // daily limit reached

      await expect(service.create('tr-1', 'user-1', dto)).rejects.toThrow('FEEDBACK_RATE_LIMIT');
      expect(mockPrisma.translationFeedback.create).not.toHaveBeenCalled();
    });

    it('should still return the report if queueing the re-translation fails', async () => {
      mockRetranslation.enqueue.mockRejectedValue(new Error('Redis down'));

      const feedback = await service.create('tr-1', 'user-1', dto);

      expect(feedback.id).toBe('fb-1');
    });
  });

  describe('listForTranslation', () => {
    it('should return the reports for an owned translation', async () => {
      mockPrisma.translationFeedback.findMany.mockResolvedValue([{ id: 'fb-1' }]);

      const list = await service.listForTranslation('tr-1', 'user-1');

      expect(list).toEqual([{ id: 'fb-1' }]);
      expect(mockPrisma.translationFeedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { translationId: 'tr-1' } }),
      );
    });

    it('should refuse a user who does not own the book', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue({
        ...ownedTranslation,
        book: { userBooks: [] },
      });

      await expect(service.listForTranslation('tr-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getQuota', () => {
    it('should report how many re-translations are left', async () => {
      mockPrisma.translationFeedback.count.mockResolvedValue(4);

      const quota = await service.getQuota('tr-1', 'user-1');

      expect(quota).toEqual({ used: 4, limit: 30, remaining: 26 });
    });

    it('should never report a negative remainder', async () => {
      mockPrisma.translationFeedback.count.mockResolvedValue(35);

      const quota = await service.getQuota('tr-1', 'user-1');

      expect(quota.remaining).toBe(0);
    });
  });
});
