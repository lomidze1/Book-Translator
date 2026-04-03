import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ReaderService } from '../../src/reader/reader.service';

describe('ReaderService — Edge Cases', () => {
  let service: ReaderService;

  const mockPrisma = {
    readingProgress: { upsert: vi.fn(), findUnique: vi.fn() },
    bookmark: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    highlight: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    note: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    book: { findUnique: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new (ReaderService as any)(mockPrisma);
    mockPrisma.book.findUnique.mockResolvedValue({ id: 'book-1' });
  });

  // ========================
  // Database Error Handling
  // ========================

  describe('Database Errors', () => {
    it('should propagate database connection errors from saveProgress', async () => {
      mockPrisma.readingProgress.upsert.mockRejectedValue(new Error('Connection refused'));

      await expect(
        service.saveProgress('user-1', {
          bookId: 'book-1',
          currentChapter: 1,
          currentPosition: 0,
          percentage: 0,
        }),
      ).rejects.toThrow('Connection refused');
    });

    it('should propagate database errors from getBookmarks', async () => {
      mockPrisma.bookmark.findMany.mockRejectedValue(new Error('Query timeout'));

      await expect(service.getBookmarks('user-1', 'book-1'))
        .rejects.toThrow('Query timeout');
    });

    it('should handle Prisma P2025 (record not found) on delete', async () => {
      mockPrisma.bookmark.findUnique.mockResolvedValue({ id: 'bm-1', userId: 'user-1' });
      const { PrismaClientKnownRequestError } = await import('@prisma/client/runtime/library');
      mockPrisma.bookmark.delete.mockRejectedValue(
        new PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: '5.0.0',
        }),
      );

      await expect(service.deleteBookmark('user-1', 'bm-1'))
        .rejects.toThrow();
    });
  });

  // ========================
  // Boundary Values
  // ========================

  describe('Boundary Values', () => {
    it('should accept percentage = 0 (start of book)', async () => {
      mockPrisma.readingProgress.upsert.mockResolvedValue({ percentage: 0 });

      const result = await service.saveProgress('user-1', {
        bookId: 'book-1',
        currentChapter: 1,
        currentPosition: 0,
        percentage: 0,
      });

      expect(result.percentage).toBe(0);
    });

    it('should accept percentage = 100 (end of book)', async () => {
      mockPrisma.readingProgress.upsert.mockResolvedValue({ percentage: 100 });

      const result = await service.saveProgress('user-1', {
        bookId: 'book-1',
        currentChapter: 10,
        currentPosition: 99999,
        percentage: 100,
      });

      expect(result.percentage).toBe(100);
    });

    it('should accept position = 0 (start of chapter)', async () => {
      mockPrisma.bookmark.create.mockResolvedValue({ id: 'bm-1', position: 0 });

      const result = await service.createBookmark('user-1', {
        bookId: 'book-1',
        chapterNumber: 1,
        position: 0,
      });

      expect(result.position).toBe(0);
    });

    it('should handle very large position values', async () => {
      mockPrisma.readingProgress.upsert.mockResolvedValue({ currentPosition: 999999999 });

      const result = await service.saveProgress('user-1', {
        bookId: 'book-1',
        currentChapter: 1,
        currentPosition: 999999999,
        percentage: 50,
      });

      expect(result.currentPosition).toBe(999999999);
    });
  });

  // ========================
  // Unicode / Georgian Support
  // ========================

  describe('Unicode / Georgian Support', () => {
    it('should handle Georgian text in bookmark label', async () => {
      const label = 'თავი 1 — შესავალი';
      mockPrisma.bookmark.create.mockResolvedValue({ id: 'bm-1', label });

      const result = await service.createBookmark('user-1', {
        bookId: 'book-1',
        chapterNumber: 1,
        position: 0,
        label,
      });

      expect(result.label).toBe(label);
    });

    it('should handle Georgian text in highlight selectedText', async () => {
      const selectedText = 'ეს არის ქართული ტექსტი რომელიც მონიშნულია';
      mockPrisma.highlight.create.mockResolvedValue({ id: 'hl-1', selectedText });

      const result = await service.createHighlight('user-1', {
        bookId: 'book-1',
        chapterNumber: 1,
        startPosition: 0,
        endPosition: 50,
        selectedText,
      });

      expect(result.selectedText).toBe(selectedText);
    });

    it('should handle Georgian text in note content', async () => {
      const content = 'ეს არის ჩემი შენიშვნა ამ პარაგრაფის შესახებ';
      mockPrisma.note.create.mockResolvedValue({ id: 'n-1', content });

      const result = await service.createNote('user-1', {
        bookId: 'book-1',
        chapterNumber: 1,
        content,
      });

      expect(result.content).toBe(content);
    });

    it('should handle mixed Georgian + English text', async () => {
      const content = 'Chapter 1 — თავი 1: Introduction შესავალი';
      mockPrisma.note.create.mockResolvedValue({ id: 'n-1', content });

      const result = await service.createNote('user-1', {
        bookId: 'book-1',
        chapterNumber: 1,
        content,
      });

      expect(result.content).toBe(content);
    });
  });

  // ========================
  // Empty/Null Values
  // ========================

  describe('Empty and Edge Values', () => {
    it('should handle getProgress for non-existent book gracefully', async () => {
      mockPrisma.readingProgress.findUnique.mockResolvedValue(null);

      const result = await service.getProgress('user-1', 'nonexistent-book');

      expect(result).toBeNull();
    });

    it('should return empty arrays for a book with no bookmarks', async () => {
      mockPrisma.bookmark.findMany.mockResolvedValue([]);

      const result = await service.getBookmarks('user-1', 'book-1');

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('should return empty arrays for a book with no highlights', async () => {
      mockPrisma.highlight.findMany.mockResolvedValue([]);

      const result = await service.getHighlights('user-1', 'book-1');

      expect(result).toEqual([]);
    });

    it('should return empty arrays for a book with no notes', async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);

      const result = await service.getNotes('user-1', 'book-1');

      expect(result).toEqual([]);
    });

    it('should validate book existence for all create operations', async () => {
      mockPrisma.book.findUnique.mockResolvedValue(null);

      await expect(
        service.createBookmark('user-1', { bookId: 'gone', chapterNumber: 1, position: 0 }),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.createHighlight('user-1', {
          bookId: 'gone', chapterNumber: 1,
          startPosition: 0, endPosition: 10, selectedText: 'text',
        }),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.createNote('user-1', { bookId: 'gone', chapterNumber: 1, content: 'note' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
