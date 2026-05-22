import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { ReaderService } from '../../src/reader/reader.service';

describe('ReaderService', () => {
  let service: ReaderService;

  const mockPrisma = {
    readingProgress: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    bookmark: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    highlight: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    note: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    book: {
      findUnique: vi.fn(),
    },
  };

  const userId = 'user-1';
  const bookId = 'book-1';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new (ReaderService as any)(mockPrisma);
    // Default: book exists
    mockPrisma.book.findUnique.mockResolvedValue({ id: bookId });
  });

  // ========================
  // Reading Progress
  // ========================

  describe('saveProgress', () => {
    const dto = {
      bookId,
      currentChapter: 3,
      currentPosition: 1500,
      percentage: 45.5,
    };

    it('should upsert reading progress', async () => {
      const expected = { id: 'rp-1', userId, ...dto, lastReadAt: new Date() };
      mockPrisma.readingProgress.upsert.mockResolvedValue(expected);

      const result = await service.saveProgress(userId, dto);

      expect(result).toEqual(expected);
      expect(mockPrisma.readingProgress.upsert).toHaveBeenCalledWith({
        where: { userId_bookId: { userId, bookId } },
        update: {
          currentChapter: dto.currentChapter,
          currentPosition: dto.currentPosition,
          percentage: dto.percentage,
          lastReadAt: expect.any(Date),
        },
        create: {
          userId,
          bookId: dto.bookId,
          currentChapter: dto.currentChapter,
          currentPosition: dto.currentPosition,
          percentage: dto.percentage,
        },
      });
    });

    it('should create new progress when none exists (upsert create path)', async () => {
      const created = { id: 'rp-new', userId, ...dto };
      mockPrisma.readingProgress.upsert.mockResolvedValue(created);

      const result = await service.saveProgress(userId, dto);

      expect(result.id).toBe('rp-new');
    });

    it('should update existing progress (upsert update path)', async () => {
      const updated = { id: 'rp-existing', userId, ...dto, percentage: 80 };
      mockPrisma.readingProgress.upsert.mockResolvedValue(updated);

      const result = await service.saveProgress(userId, { ...dto, percentage: 80 });

      expect(result.percentage).toBe(80);
    });

    it('should update lastReadAt timestamp', async () => {
      mockPrisma.readingProgress.upsert.mockResolvedValue({});

      await service.saveProgress(userId, dto);

      const callArgs = mockPrisma.readingProgress.upsert.mock.calls[0][0];
      expect(callArgs.update.lastReadAt).toBeInstanceOf(Date);
    });

    it('should throw NotFoundException when book does not exist', async () => {
      mockPrisma.book.findUnique.mockResolvedValue(null);

      await expect(service.saveProgress(userId, dto))
        .rejects.toThrow(NotFoundException);
    });

    it('should use composite unique key (userId_bookId)', async () => {
      mockPrisma.readingProgress.upsert.mockResolvedValue({});

      await service.saveProgress(userId, dto);

      const callArgs = mockPrisma.readingProgress.upsert.mock.calls[0][0];
      expect(callArgs.where.userId_bookId).toEqual({ userId, bookId });
    });
  });

  describe('getProgress', () => {
    it('should return progress when found', async () => {
      const progress = { id: 'rp-1', userId, bookId, currentChapter: 5, percentage: 75 };
      mockPrisma.readingProgress.findUnique.mockResolvedValue(progress);

      const result = await service.getProgress(userId, bookId);

      expect(result).toEqual(progress);
    });

    it('should return null when no progress exists', async () => {
      mockPrisma.readingProgress.findUnique.mockResolvedValue(null);

      const result = await service.getProgress(userId, bookId);

      expect(result).toBeNull();
    });

    it('should use composite unique key for lookup', async () => {
      mockPrisma.readingProgress.findUnique.mockResolvedValue(null);

      await service.getProgress(userId, bookId);

      expect(mockPrisma.readingProgress.findUnique).toHaveBeenCalledWith({
        where: { userId_bookId: { userId, bookId } },
      });
    });
  });

  // ========================
  // Bookmarks
  // ========================

  describe('createBookmark', () => {
    const dto = { bookId, chapterNumber: 1, position: 500, label: 'მნიშვნელოვანი' };

    it('should create bookmark with all fields', async () => {
      const expected = { id: 'bm-1', userId, ...dto, createdAt: new Date() };
      mockPrisma.bookmark.create.mockResolvedValue(expected);

      const result = await service.createBookmark(userId, dto);

      expect(result).toEqual(expected);
      expect(mockPrisma.bookmark.create).toHaveBeenCalledWith({
        data: { userId, bookId, chapterNumber: 1, position: 500, label: 'მნიშვნელოვანი' },
      });
    });

    it('should create bookmark with optional label as undefined', async () => {
      const dtoNoLabel = { bookId, chapterNumber: 1, position: 0 };
      mockPrisma.bookmark.create.mockResolvedValue({ id: 'bm-2', userId, ...dtoNoLabel });

      const result = await service.createBookmark(userId, dtoNoLabel);

      expect(result.id).toBe('bm-2');
      expect(mockPrisma.bookmark.create).toHaveBeenCalledWith({
        data: { userId, bookId, chapterNumber: 1, position: 0, label: undefined },
      });
    });

    it('should throw NotFoundException when book does not exist', async () => {
      mockPrisma.book.findUnique.mockResolvedValue(null);

      await expect(service.createBookmark(userId, dto))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException on duplicate bookmark (unique constraint)', async () => {
      const prismaError = new Error('Unique constraint') as any;
      prismaError.constructor = { name: 'PrismaClientKnownRequestError' };
      // Simulate Prisma P2002 error
      const { PrismaClientKnownRequestError } = await import('@prisma/client/runtime/library');
      const uniqueError = new PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      mockPrisma.bookmark.create.mockRejectedValue(uniqueError);

      await expect(service.createBookmark(userId, dto))
        .rejects.toThrow(ConflictException);
    });

    it('should rethrow non-P2002 Prisma errors', async () => {
      mockPrisma.bookmark.create.mockRejectedValue(new Error('Connection lost'));

      await expect(service.createBookmark(userId, dto))
        .rejects.toThrow('Connection lost');
    });
  });

  describe('getBookmarks', () => {
    it('should return bookmarks ordered by createdAt', async () => {
      const bookmarks = [
        { id: 'bm-1', chapterNumber: 1, position: 0, createdAt: new Date('2024-01-01') },
        { id: 'bm-2', chapterNumber: 2, position: 100, createdAt: new Date('2024-01-02') },
      ];
      mockPrisma.bookmark.findMany.mockResolvedValue(bookmarks);

      const result = await service.getBookmarks(userId, bookId);

      expect(result).toEqual(bookmarks);
      expect(mockPrisma.bookmark.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId, bookId },
          orderBy: { createdAt: 'asc' },
        }),
      );
    });

    it('should return empty array when no bookmarks', async () => {
      mockPrisma.bookmark.findMany.mockResolvedValue([]);

      const result = await service.getBookmarks(userId, bookId);

      expect(result).toEqual([]);
    });

    it('should filter by both userId and bookId', async () => {
      mockPrisma.bookmark.findMany.mockResolvedValue([]);

      await service.getBookmarks(userId, bookId);

      expect(mockPrisma.bookmark.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId, bookId },
          orderBy: { createdAt: 'asc' },
        }),
      );
    });
  });

  describe('deleteBookmark', () => {
    it('should delete bookmark when user is owner', async () => {
      mockPrisma.bookmark.findUnique.mockResolvedValue({ id: 'bm-1', userId });
      mockPrisma.bookmark.delete.mockResolvedValue({ id: 'bm-1' });

      const result = await service.deleteBookmark(userId, 'bm-1');

      expect(result.id).toBe('bm-1');
      expect(mockPrisma.bookmark.delete).toHaveBeenCalledWith({ where: { id: 'bm-1' } });
    });

    it('should throw NotFoundException when bookmark does not exist', async () => {
      mockPrisma.bookmark.findUnique.mockResolvedValue(null);

      await expect(service.deleteBookmark(userId, 'nonexistent'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not owner', async () => {
      mockPrisma.bookmark.findUnique.mockResolvedValue({ id: 'bm-1', userId: 'other-user' });

      await expect(service.deleteBookmark(userId, 'bm-1'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  // ========================
  // Highlights
  // ========================

  describe('createHighlight', () => {
    const dto = {
      bookId,
      chapterNumber: 2,
      startPosition: 100,
      endPosition: 200,
      selectedText: 'მონიშნული ტექსტი',
    };

    it('should create highlight with default color "yellow"', async () => {
      const expected = { id: 'hl-1', userId, ...dto, color: 'yellow' };
      mockPrisma.highlight.create.mockResolvedValue(expected);

      const result = await service.createHighlight(userId, dto);

      expect(result.color).toBe('yellow');
      expect(mockPrisma.highlight.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ color: 'yellow' }),
      });
    });

    it('should create highlight with specified color', async () => {
      const expected = { id: 'hl-1', userId, ...dto, color: 'green' };
      mockPrisma.highlight.create.mockResolvedValue(expected);

      await service.createHighlight(userId, { ...dto, color: 'green' });

      expect(mockPrisma.highlight.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ color: 'green' }),
      });
    });

    it('should store selectedText', async () => {
      mockPrisma.highlight.create.mockResolvedValue({ id: 'hl-1' });

      await service.createHighlight(userId, dto);

      expect(mockPrisma.highlight.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ selectedText: 'მონიშნული ტექსტი' }),
      });
    });

    it('should throw BadRequestException when startPosition >= endPosition', async () => {
      await expect(service.createHighlight(userId, { ...dto, startPosition: 200, endPosition: 100 }))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when startPosition equals endPosition', async () => {
      await expect(service.createHighlight(userId, { ...dto, startPosition: 100, endPosition: 100 }))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when book does not exist', async () => {
      mockPrisma.book.findUnique.mockResolvedValue(null);

      await expect(service.createHighlight(userId, dto))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('getHighlights', () => {
    it('should return highlights with notes relation', async () => {
      const highlights = [
        { id: 'hl-1', selectedText: 'text', notes: [{ id: 'n-1', content: 'note' }] },
      ];
      mockPrisma.highlight.findMany.mockResolvedValue(highlights);

      const result = await service.getHighlights(userId, bookId);

      expect(result[0].notes).toHaveLength(1);
      expect(mockPrisma.highlight.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId, bookId },
          include: { notes: true },
          orderBy: { createdAt: 'asc' },
        }),
      );
    });

    it('should return empty array when no highlights', async () => {
      mockPrisma.highlight.findMany.mockResolvedValue([]);

      const result = await service.getHighlights(userId, bookId);

      expect(result).toEqual([]);
    });

    it('should filter by both userId and bookId', async () => {
      mockPrisma.highlight.findMany.mockResolvedValue([]);

      await service.getHighlights('user-2', 'book-2');

      expect(mockPrisma.highlight.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-2', bookId: 'book-2' },
          include: { notes: true },
          orderBy: { createdAt: 'asc' },
        }),
      );
    });
  });

  describe('updateHighlight', () => {
    it('should update highlight color', async () => {
      mockPrisma.highlight.findUnique.mockResolvedValue({ id: 'hl-1', userId });
      mockPrisma.highlight.update.mockResolvedValue({ id: 'hl-1', color: 'blue' });

      const result = await service.updateHighlight(userId, 'hl-1', { color: 'blue' });

      expect(result.color).toBe('blue');
      expect(mockPrisma.highlight.update).toHaveBeenCalledWith({
        where: { id: 'hl-1' },
        data: { color: 'blue' },
      });
    });

    it('should throw NotFoundException when highlight does not exist', async () => {
      mockPrisma.highlight.findUnique.mockResolvedValue(null);

      await expect(service.updateHighlight(userId, 'nonexistent', { color: 'blue' }))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not owner', async () => {
      mockPrisma.highlight.findUnique.mockResolvedValue({ id: 'hl-1', userId: 'other-user' });

      await expect(service.updateHighlight(userId, 'hl-1', { color: 'blue' }))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteHighlight', () => {
    it('should delete highlight when user is owner', async () => {
      mockPrisma.highlight.findUnique.mockResolvedValue({ id: 'hl-1', userId });
      mockPrisma.highlight.delete.mockResolvedValue({ id: 'hl-1' });

      const result = await service.deleteHighlight(userId, 'hl-1');

      expect(result.id).toBe('hl-1');
    });

    it('should throw NotFoundException when highlight does not exist', async () => {
      mockPrisma.highlight.findUnique.mockResolvedValue(null);

      await expect(service.deleteHighlight(userId, 'nonexistent'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not owner', async () => {
      mockPrisma.highlight.findUnique.mockResolvedValue({ id: 'hl-1', userId: 'other-user' });

      await expect(service.deleteHighlight(userId, 'hl-1'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  // ========================
  // Notes
  // ========================

  describe('createNote', () => {
    const dto = { bookId, chapterNumber: 1, content: 'ჩემი შენიშვნა' };

    it('should create standalone note (no highlightId)', async () => {
      const expected = { id: 'n-1', userId, ...dto, highlightId: null };
      mockPrisma.note.create.mockResolvedValue(expected);

      const result = await service.createNote(userId, dto);

      expect(result.highlightId).toBeNull();
      expect(mockPrisma.note.create).toHaveBeenCalledWith({
        data: { userId, bookId, chapterNumber: 1, highlightId: undefined, content: 'ჩემი შენიშვნა' },
      });
    });

    it('should create note attached to highlight', async () => {
      mockPrisma.highlight.findUnique.mockResolvedValue({ id: 'hl-1', userId });
      const expected = { id: 'n-1', userId, ...dto, highlightId: 'hl-1' };
      mockPrisma.note.create.mockResolvedValue(expected);

      const result = await service.createNote(userId, { ...dto, highlightId: 'hl-1' });

      expect(result.highlightId).toBe('hl-1');
    });

    it('should throw NotFoundException when highlightId does not exist', async () => {
      mockPrisma.highlight.findUnique.mockResolvedValue(null);

      await expect(service.createNote(userId, { ...dto, highlightId: 'nonexistent' }))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when highlight belongs to another user', async () => {
      mockPrisma.highlight.findUnique.mockResolvedValue({ id: 'hl-1', userId: 'other-user' });

      await expect(service.createNote(userId, { ...dto, highlightId: 'hl-1' }))
        .rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when book does not exist', async () => {
      mockPrisma.book.findUnique.mockResolvedValue(null);

      await expect(service.createNote(userId, dto))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('getNotes', () => {
    it('should return notes with highlight relation', async () => {
      const notes = [
        { id: 'n-1', content: 'note', highlight: { id: 'hl-1', selectedText: 'text' } },
      ];
      mockPrisma.note.findMany.mockResolvedValue(notes);

      const result = await service.getNotes(userId, bookId);

      expect(result[0].highlight).toBeDefined();
      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId, bookId },
          include: { highlight: true },
          orderBy: { createdAt: 'asc' },
        }),
      );
    });

    it('should return empty array when no notes', async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);

      const result = await service.getNotes(userId, bookId);

      expect(result).toEqual([]);
    });

    it('should filter by both userId and bookId', async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);

      await service.getNotes('user-2', 'book-2');

      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-2', bookId: 'book-2' },
          include: { highlight: true },
          orderBy: { createdAt: 'asc' },
        }),
      );
    });
  });

  describe('updateNote', () => {
    it('should update note content', async () => {
      mockPrisma.note.findUnique.mockResolvedValue({ id: 'n-1', userId });
      mockPrisma.note.update.mockResolvedValue({ id: 'n-1', content: 'განახლებული' });

      const result = await service.updateNote(userId, 'n-1', { content: 'განახლებული' });

      expect(result.content).toBe('განახლებული');
      expect(mockPrisma.note.update).toHaveBeenCalledWith({
        where: { id: 'n-1' },
        data: { content: 'განახლებული' },
      });
    });

    it('should throw NotFoundException when note does not exist', async () => {
      mockPrisma.note.findUnique.mockResolvedValue(null);

      await expect(service.updateNote(userId, 'nonexistent', { content: 'x' }))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not owner', async () => {
      mockPrisma.note.findUnique.mockResolvedValue({ id: 'n-1', userId: 'other-user' });

      await expect(service.updateNote(userId, 'n-1', { content: 'x' }))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteNote', () => {
    it('should delete note when user is owner', async () => {
      mockPrisma.note.findUnique.mockResolvedValue({ id: 'n-1', userId });
      mockPrisma.note.delete.mockResolvedValue({ id: 'n-1' });

      const result = await service.deleteNote(userId, 'n-1');

      expect(result.id).toBe('n-1');
    });

    it('should throw NotFoundException when note does not exist', async () => {
      mockPrisma.note.findUnique.mockResolvedValue(null);

      await expect(service.deleteNote(userId, 'nonexistent'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not owner', async () => {
      mockPrisma.note.findUnique.mockResolvedValue({ id: 'n-1', userId: 'other-user' });

      await expect(service.deleteNote(userId, 'n-1'))
        .rejects.toThrow(ForbiddenException);
    });
  });
});
