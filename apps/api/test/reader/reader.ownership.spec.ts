import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReaderService } from '../../src/reader/reader.service';

describe('ReaderService — Ownership & Authorization', () => {
  let service: ReaderService;

  const mockPrisma = {
    readingProgress: { upsert: vi.fn(), findUnique: vi.fn() },
    bookmark: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    highlight: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    note: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    book: { findUnique: vi.fn() },
  };

  const userA = 'user-A';
  const userB = 'user-B';
  const bookId = 'book-1';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new (ReaderService as any)(mockPrisma);
    mockPrisma.book.findUnique.mockResolvedValue({ id: bookId });
  });

  // ========================
  // Bookmark Ownership
  // ========================

  describe('Bookmark Ownership', () => {
    it('user A should NOT delete user B bookmark', async () => {
      mockPrisma.bookmark.findUnique.mockResolvedValue({ id: 'bm-1', userId: userB });

      await expect(service.deleteBookmark(userA, 'bm-1'))
        .rejects.toThrow(ForbiddenException);

      expect(mockPrisma.bookmark.delete).not.toHaveBeenCalled();
    });

    it('user A bookmarks should NOT include user B bookmarks', async () => {
      mockPrisma.bookmark.findMany.mockResolvedValue([]);

      await service.getBookmarks(userA, bookId);

      expect(mockPrisma.bookmark.findMany).toHaveBeenCalledWith({
        where: { userId: userA, bookId },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  // ========================
  // Highlight Ownership
  // ========================

  describe('Highlight Ownership', () => {
    it('user A should NOT delete user B highlight', async () => {
      mockPrisma.highlight.findUnique.mockResolvedValue({ id: 'hl-1', userId: userB });

      await expect(service.deleteHighlight(userA, 'hl-1'))
        .rejects.toThrow(ForbiddenException);

      expect(mockPrisma.highlight.delete).not.toHaveBeenCalled();
    });

    it('user A should NOT update user B highlight color', async () => {
      mockPrisma.highlight.findUnique.mockResolvedValue({ id: 'hl-1', userId: userB });

      await expect(service.updateHighlight(userA, 'hl-1', { color: 'red' }))
        .rejects.toThrow(ForbiddenException);

      expect(mockPrisma.highlight.update).not.toHaveBeenCalled();
    });

    it('user A highlights should NOT include user B highlights', async () => {
      mockPrisma.highlight.findMany.mockResolvedValue([]);

      await service.getHighlights(userA, bookId);

      expect(mockPrisma.highlight.findMany).toHaveBeenCalledWith({
        where: { userId: userA, bookId },
        include: { notes: true },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  // ========================
  // Note Ownership
  // ========================

  describe('Note Ownership', () => {
    it('user A should NOT delete user B note', async () => {
      mockPrisma.note.findUnique.mockResolvedValue({ id: 'n-1', userId: userB });

      await expect(service.deleteNote(userA, 'n-1'))
        .rejects.toThrow(ForbiddenException);

      expect(mockPrisma.note.delete).not.toHaveBeenCalled();
    });

    it('user A should NOT update user B note', async () => {
      mockPrisma.note.findUnique.mockResolvedValue({ id: 'n-1', userId: userB });

      await expect(service.updateNote(userA, 'n-1', { content: 'hacked' }))
        .rejects.toThrow(ForbiddenException);

      expect(mockPrisma.note.update).not.toHaveBeenCalled();
    });

    it('user A notes should NOT include user B notes', async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);

      await service.getNotes(userA, bookId);

      expect(mockPrisma.note.findMany).toHaveBeenCalledWith({
        where: { userId: userA, bookId },
        include: { highlight: true },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('user A should NOT attach note to user B highlight', async () => {
      mockPrisma.highlight.findUnique.mockResolvedValue({ id: 'hl-1', userId: userB });

      await expect(
        service.createNote(userA, {
          bookId,
          chapterNumber: 1,
          highlightId: 'hl-1',
          content: 'my note',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ========================
  // Reading Progress Isolation
  // ========================

  describe('Reading Progress Isolation', () => {
    it('user A progress should use user A ID in query', async () => {
      mockPrisma.readingProgress.findUnique.mockResolvedValue(null);

      await service.getProgress(userA, bookId);

      expect(mockPrisma.readingProgress.findUnique).toHaveBeenCalledWith({
        where: { userId_bookId: { userId: userA, bookId } },
      });
    });

    it('user A saveProgress should use user A ID in upsert', async () => {
      mockPrisma.readingProgress.upsert.mockResolvedValue({});

      await service.saveProgress(userA, {
        bookId,
        currentChapter: 1,
        currentPosition: 0,
        percentage: 0,
      });

      const callArgs = mockPrisma.readingProgress.upsert.mock.calls[0][0];
      expect(callArgs.where.userId_bookId.userId).toBe(userA);
      expect(callArgs.create.userId).toBe(userA);
    });
  });
});
