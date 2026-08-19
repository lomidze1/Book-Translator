import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ReaderService } from '../../src/reader/reader.service';

/**
 * Gap coverage on top of reader.service / edge-cases / ownership specs:
 * pagination clamping, validation ordering (which check fires first and what
 * is NOT called after a failure), upsert idempotency, and update whitelisting.
 */
describe('ReaderService — Gaps', () => {
  let service: ReaderService;

  const mockPrisma = {
    readingProgress: { upsert: vi.fn(), findUnique: vi.fn() },
    bookmark: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    highlight: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    note: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    book: { findUnique: vi.fn() },
    userBook: { findFirst: vi.fn() },
  };

  const userId = 'user-1';
  const bookId = 'book-1';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new (ReaderService as any)(mockPrisma);
    mockPrisma.book.findUnique.mockResolvedValue({ id: bookId });
    mockPrisma.userBook.findFirst.mockResolvedValue({ id: 'ub-1' });
  });

  // ========================
  // Pagination clamping
  // ========================

  describe('Pagination clamping', () => {
    beforeEach(() => {
      mockPrisma.bookmark.findMany.mockResolvedValue([]);
      mockPrisma.highlight.findMany.mockResolvedValue([]);
      mockPrisma.note.findMany.mockResolvedValue([]);
    });

    it('defaults to page 1 / limit 100 (skip 0, take 100)', async () => {
      await service.getBookmarks(userId, bookId);

      expect(mockPrisma.bookmark.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 100 }),
      );
    });

    it('treats page 0 as page 1', async () => {
      await service.getBookmarks(userId, bookId, 0, 100);

      expect(mockPrisma.bookmark.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 100 }),
      );
    });

    it('treats a negative page as page 1', async () => {
      await service.getHighlights(userId, bookId, -5, 100);

      expect(mockPrisma.highlight.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 100 }),
      );
    });

    it('caps the limit at 200 so limit=10000 cannot DoS the endpoint', async () => {
      await service.getNotes(userId, bookId, 1, 10000);

      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 200 }),
      );
    });

    it('raises limit 0 and negative limits to 1', async () => {
      await service.getBookmarks(userId, bookId, 1, 0);
      expect(mockPrisma.bookmark.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ skip: 0, take: 1 }),
      );

      await service.getBookmarks(userId, bookId, 1, -50);
      expect(mockPrisma.bookmark.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ skip: 0, take: 1 }),
      );
    });

    it('computes skip from the clamped limit, not the requested one', async () => {
      await service.getHighlights(userId, bookId, 3, 500);

      // page 3 at the capped 200/page → skip 400.
      expect(mockPrisma.highlight.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 400, take: 200 }),
      );
    });

    it('falls back to defaults for NaN page/limit', async () => {
      await service.getNotes(userId, bookId, Number.NaN, Number.NaN);

      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 100 }),
      );
    });

    it('a page past the data simply queries a large skip and returns []', async () => {
      const result = await service.getBookmarks(userId, bookId, 999, 100);

      expect(mockPrisma.bookmark.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 99800, take: 100 }),
      );
      expect(result).toEqual([]);
    });
  });

  // ========================
  // Validation ordering
  // ========================

  describe('Validation ordering', () => {
    it('reports a missing book before checking the UserBook relation', async () => {
      mockPrisma.book.findUnique.mockResolvedValue(null);
      mockPrisma.userBook.findFirst.mockResolvedValue(null);

      await expect(
        service.createBookmark(userId, { bookId: 'gone', chapterNumber: 1, position: 0 }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.userBook.findFirst).not.toHaveBeenCalled();
    });

    it('checks book access before highlight geometry: no access + bad positions → Forbidden', async () => {
      mockPrisma.userBook.findFirst.mockResolvedValue(null);

      await expect(
        service.createHighlight(userId, {
          bookId, chapterNumber: 1, startPosition: 10, endPosition: 5, selectedText: 'x',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('never reaches prisma.create when highlight geometry is invalid', async () => {
      await expect(
        service.createHighlight(userId, {
          bookId, chapterNumber: 1, startPosition: 10, endPosition: 5, selectedText: 'x',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.highlight.create).not.toHaveBeenCalled();
    });

    it('never reaches upsert when saveProgress access validation fails', async () => {
      mockPrisma.userBook.findFirst.mockResolvedValue(null);

      await expect(
        service.saveProgress(userId, { bookId, currentChapter: 1, currentPosition: 0, percentage: 0 }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.readingProgress.upsert).not.toHaveBeenCalled();
    });

    it('never reaches note.create when the referenced highlight fails ownership', async () => {
      mockPrisma.highlight.findUnique.mockResolvedValue({ id: 'hl-1', userId: 'someone-else' });

      await expect(
        service.createNote(userId, { bookId, chapterNumber: 1, highlightId: 'hl-1', content: 'x' }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.note.create).not.toHaveBeenCalled();
    });

    it('accepts the minimal valid highlight geometry (start 0, end 1)', async () => {
      mockPrisma.highlight.create.mockResolvedValue({ id: 'hl-1' });

      await service.createHighlight(userId, {
        bookId, chapterNumber: 1, startPosition: 0, endPosition: 1, selectedText: 'ა',
      });

      expect(mockPrisma.highlight.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ startPosition: 0, endPosition: 1 }),
      });
    });
  });

  // ========================
  // Progress upsert idempotency
  // ========================

  describe('Progress upsert idempotency', () => {
    const dto = { bookId, currentChapter: 2, currentPosition: 300, percentage: 25 };

    it('repeating the same save targets the same composite key both times', async () => {
      mockPrisma.readingProgress.upsert.mockResolvedValue({ id: 'rp-1', ...dto });

      await service.saveProgress(userId, dto);
      await service.saveProgress(userId, dto);

      expect(mockPrisma.readingProgress.upsert).toHaveBeenCalledTimes(2);
      const [first, second] = mockPrisma.readingProgress.upsert.mock.calls;
      expect(first[0].where).toEqual(second[0].where);
      expect(first[0].where).toEqual({ userId_bookId: { userId, bookId } });
    });

    it('passes a fractional percentage through unchanged (no rounding)', async () => {
      mockPrisma.readingProgress.upsert.mockResolvedValue({});

      await service.saveProgress(userId, { ...dto, percentage: 99.99 });

      const args = mockPrisma.readingProgress.upsert.mock.calls[0][0];
      expect(args.update.percentage).toBe(99.99);
      expect(args.create.percentage).toBe(99.99);
    });

    it('a save that moves backwards is honored — the service trusts the client position', async () => {
      mockPrisma.readingProgress.upsert.mockResolvedValue({});

      await service.saveProgress(userId, { ...dto, currentChapter: 1, percentage: 5 });

      const args = mockPrisma.readingProgress.upsert.mock.calls[0][0];
      expect(args.update.currentChapter).toBe(1);
      expect(args.update.percentage).toBe(5);
    });
  });

  // ========================
  // Update whitelisting
  // ========================

  describe('Update whitelisting', () => {
    it('updateHighlight writes only the color, never positions or text', async () => {
      mockPrisma.highlight.findUnique.mockResolvedValue({ id: 'hl-1', userId });
      mockPrisma.highlight.update.mockResolvedValue({ id: 'hl-1', color: 'green' });

      await service.updateHighlight(userId, 'hl-1', {
        color: 'green',
        // Fields smuggled past the DTO must not reach the database.
        startPosition: 0, endPosition: 9999, selectedText: 'tampered', userId: 'attacker',
      } as any);

      expect(mockPrisma.highlight.update).toHaveBeenCalledWith({
        where: { id: 'hl-1' },
        data: { color: 'green' },
      });
    });

    it('updateNote writes only the content, never ownership or book fields', async () => {
      mockPrisma.note.findUnique.mockResolvedValue({ id: 'n-1', userId });
      mockPrisma.note.update.mockResolvedValue({ id: 'n-1', content: 'ok' });

      await service.updateNote(userId, 'n-1', {
        content: 'ok',
        userId: 'attacker', bookId: 'other-book', highlightId: 'hl-x',
      } as any);

      expect(mockPrisma.note.update).toHaveBeenCalledWith({
        where: { id: 'n-1' },
        data: { content: 'ok' },
      });
    });
  });

  // ========================
  // Cross-entity referential gaps
  // ========================

  describe('Cross-entity referential behavior', () => {
    it('createNote does NOT verify the highlight belongs to the same book (documents current behavior)', async () => {
      // Highlight owned by the user but anchored in a different book.
      mockPrisma.highlight.findUnique.mockResolvedValue({ id: 'hl-1', userId, bookId: 'other-book' });
      mockPrisma.note.create.mockResolvedValue({ id: 'n-1', highlightId: 'hl-1' });

      const result = await service.createNote(userId, {
        bookId, chapterNumber: 1, highlightId: 'hl-1', content: 'cross-book note',
      });

      // The service currently accepts this; only ownership is enforced.
      expect(result.id).toBe('n-1');
      expect(mockPrisma.note.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ bookId, highlightId: 'hl-1' }),
      });
    });

    it('getProgress performs no book-access check — it reads only the caller-scoped row', async () => {
      mockPrisma.readingProgress.findUnique.mockResolvedValue(null);

      await service.getProgress(userId, 'book-the-user-never-owned');

      expect(mockPrisma.book.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.userBook.findFirst).not.toHaveBeenCalled();
    });
  });
});
