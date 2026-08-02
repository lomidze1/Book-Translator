import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PreviewService } from '../../src/preview/preview.service';

const mockJob = {
  getState: vi.fn().mockResolvedValue('completed'),
  remove: vi.fn().mockResolvedValue(undefined),
};

const mockQueue = {
  add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  getJob: vi.fn().mockResolvedValue(null),
};

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => mockQueue),
}));

describe('PreviewService', () => {
  let service: PreviewService;

  const mockPrisma = {
    book: { findUnique: vi.fn() },
    bookPreview: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      count: vi.fn(),
    },
    userBook: { create: vi.fn() },
  };

  const mockConfig = {
    get: vi.fn((key: string) => (key === 'PREVIEW_DAILY_LIMIT' ? '3' : undefined)),
  };

  const ownedBook = {
    id: 'book-1',
    title: 'Test Book',
    originalFileUrl: 's3://key',
    originalFormat: 'PDF',
    userBooks: [{ id: 'ub-1' }],
    _count: { chapters: 3 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueue.getJob.mockResolvedValue(null);
    mockPrisma.bookPreview.count.mockResolvedValue(0);
    service = new PreviewService(mockPrisma as any, mockConfig as any);
  });

  describe('createPreview', () => {
    it('creates a PENDING row and enqueues with a deterministic job id', async () => {
      mockPrisma.book.findUnique.mockResolvedValue(ownedBook);
      mockPrisma.bookPreview.findUnique.mockResolvedValue(null);
      mockPrisma.bookPreview.upsert.mockResolvedValue({ id: 'pv-1', status: 'PENDING' });

      const result = await service.createPreview('book-1', 'user-1');

      expect(result).toEqual({ id: 'pv-1', status: 'PENDING', cached: false });
      expect(mockQueue.add).toHaveBeenCalledWith(
        'generate-preview',
        { previewId: 'pv-1', bookId: 'book-1', targetLanguage: 'ka' },
        expect.objectContaining({ jobId: 'preview-pv-1' }),
      );
    });

    it('sets a removal policy so the deterministic job id can be reused', async () => {
      mockPrisma.book.findUnique.mockResolvedValue(ownedBook);
      mockPrisma.bookPreview.findUnique.mockResolvedValue(null);
      mockPrisma.bookPreview.upsert.mockResolvedValue({ id: 'pv-1', status: 'PENDING' });

      await service.createPreview('book-1', 'user-1');

      const opts = mockQueue.add.mock.calls[0][2];
      expect(opts.removeOnComplete).toBeDefined();
      expect(opts.removeOnFail).toBeDefined();
    });

    it('returns a cached COMPLETED preview without spending anything', async () => {
      mockPrisma.book.findUnique.mockResolvedValue(ownedBook);
      mockPrisma.bookPreview.findUnique.mockResolvedValue({ id: 'pv-1', status: 'COMPLETED' });

      const result = await service.createPreview('book-1', 'user-1');

      expect(result).toEqual({ id: 'pv-1', status: 'COMPLETED', cached: true });
      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(mockPrisma.bookPreview.upsert).not.toHaveBeenCalled();
    });

    it('does not consume quota on a cached hit', async () => {
      mockPrisma.book.findUnique.mockResolvedValue(ownedBook);
      mockPrisma.bookPreview.findUnique.mockResolvedValue({ id: 'pv-1', status: 'COMPLETED' });

      await service.createPreview('book-1', 'user-1');

      expect(mockPrisma.bookPreview.count).not.toHaveBeenCalled();
    });

    it('returns an in-flight preview as-is without re-enqueuing', async () => {
      mockPrisma.book.findUnique.mockResolvedValue(ownedBook);
      mockPrisma.bookPreview.findUnique.mockResolvedValue({ id: 'pv-1', status: 'IN_PROGRESS' });

      const result = await service.createPreview('book-1', 'user-1');

      expect(result).toEqual({ id: 'pv-1', status: 'IN_PROGRESS', cached: false });
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('clears the stale job and re-enqueues a FAILED preview', async () => {
      mockPrisma.book.findUnique.mockResolvedValue(ownedBook);
      mockPrisma.bookPreview.findUnique.mockResolvedValue({ id: 'pv-1', status: 'FAILED' });
      mockPrisma.bookPreview.upsert.mockResolvedValue({ id: 'pv-1', status: 'PENDING' });
      mockQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.createPreview('book-1', 'user-1');

      expect(mockJob.remove).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalled();
      expect(result.cached).toBe(false);
    });

    // Regression guard: createTranslation used to claim ownership here, which
    // combined with books.service.verifyOwnership into a privilege escalation.
    it('rejects a book the user does not own and never claims ownership', async () => {
      mockPrisma.book.findUnique.mockResolvedValue({ ...ownedBook, userBooks: [] });

      await expect(service.createPreview('book-1', 'attacker')).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.userBook.create).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown book', async () => {
      mockPrisma.book.findUnique.mockResolvedValue(null);

      await expect(service.createPreview('nope', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('rejects an unparsed book with no stored file', async () => {
      mockPrisma.book.findUnique.mockResolvedValue({
        ...ownedBook,
        originalFileUrl: null,
        _count: { chapters: 0 },
      });

      await expect(service.createPreview('book-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    // The file is only needed to parse chapters. Seeded and imported books can
    // have chapters without one, and they are perfectly previewable.
    it('allows a book that already has chapters but no stored file', async () => {
      mockPrisma.book.findUnique.mockResolvedValue({
        ...ownedBook,
        originalFileUrl: null,
        _count: { chapters: 3 },
      });
      mockPrisma.bookPreview.findUnique.mockResolvedValue(null);
      mockPrisma.bookPreview.upsert.mockResolvedValue({ id: 'pv-1', status: 'PENDING' });

      await expect(service.createPreview('book-1', 'user-1')).resolves.toMatchObject({
        status: 'PENDING',
      });
      expect(mockQueue.add).toHaveBeenCalled();
    });

    it('enforces the per-user daily quota', async () => {
      mockPrisma.book.findUnique.mockResolvedValue(ownedBook);
      mockPrisma.bookPreview.findUnique.mockResolvedValue(null);
      mockPrisma.bookPreview.count.mockResolvedValue(3);

      await expect(service.createPreview('book-1', 'user-1')).rejects.toThrow(ForbiddenException);
      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(mockPrisma.bookPreview.upsert).not.toHaveBeenCalled();
    });

    it('charges quota when retrying a FAILED preview', async () => {
      mockPrisma.book.findUnique.mockResolvedValue(ownedBook);
      mockPrisma.bookPreview.findUnique.mockResolvedValue({ id: 'pv-1', status: 'FAILED' });
      mockPrisma.bookPreview.count.mockResolvedValue(3);

      await expect(service.createPreview('book-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getPreviewByBook', () => {
    const row = {
      id: 'pv-1',
      status: 'COMPLETED',
      targetLanguage: 'ka',
      content: 'ქართული ტექსტი',
      sourceText: 'English text',
      sourceWordCount: 1000,
      chapterNumber: 1,
      editorPass: false,
      createdAt: new Date('2026-01-01'),
      completedAt: new Date('2026-01-01'),
    };

    it('returns content for a COMPLETED preview', async () => {
      mockPrisma.book.findUnique.mockResolvedValue(ownedBook);
      mockPrisma.bookPreview.findUnique.mockResolvedValue(row);

      const result = await service.getPreviewByBook('book-1', 'user-1');

      expect(result.content).toBe('ქართული ტექსტი');
      expect(result.sourceText).toBe('English text');
    });

    // The single most important test in this module: getTranslation() leaks
    // every chapter at any status, and this is the guard against repeating it.
    it.each(['PENDING', 'IN_PROGRESS', 'FAILED'])(
      'withholds content while status is %s',
      async (status) => {
        mockPrisma.book.findUnique.mockResolvedValue(ownedBook);
        mockPrisma.bookPreview.findUnique.mockResolvedValue({
          ...row,
          status,
          content: 'partial leaked text',
          sourceText: 'leaked source',
        });

        const result = await service.getPreviewByBook('book-1', 'user-1');

        expect(result.content).toBeNull();
        expect(result.sourceText).toBeNull();
        expect(result.status).toBe(status);
      },
    );

    it('does not expose internal columns', async () => {
      mockPrisma.book.findUnique.mockResolvedValue(ownedBook);
      mockPrisma.bookPreview.findUnique.mockResolvedValue({
        ...row,
        tokensUsed: 4200,
        requestedById: 'user-9',
        errorMessage: 'boom',
      });

      const result = await service.getPreviewByBook('book-1', 'user-1');

      expect(result).not.toHaveProperty('tokensUsed');
      expect(result).not.toHaveProperty('requestedById');
      expect(result).not.toHaveProperty('errorMessage');
    });

    it('throws NotFoundException when no preview exists', async () => {
      mockPrisma.book.findUnique.mockResolvedValue(ownedBook);
      mockPrisma.bookPreview.findUnique.mockResolvedValue(null);

      await expect(service.getPreviewByBook('book-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for a non-owner', async () => {
      mockPrisma.book.findUnique.mockResolvedValue({ ...ownedBook, userBooks: [] });

      await expect(service.getPreviewByBook('book-1', 'stranger')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('clearQueuedJob', () => {
    it('refuses to remove an actively running job', async () => {
      mockQueue.getJob.mockResolvedValue({ ...mockJob, getState: vi.fn().mockResolvedValue('active') });

      await expect(service.clearQueuedJob('pv-1')).rejects.toThrow(BadRequestException);
    });

    it('returns false when there is no job', async () => {
      mockQueue.getJob.mockResolvedValue(null);

      await expect(service.clearQueuedJob('pv-1')).resolves.toBe(false);
    });
  });
});
