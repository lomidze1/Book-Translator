import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { ReaderController } from '../../src/reader/reader.controller';

describe('ReaderController', () => {
  let controller: ReaderController;

  const mockReaderService = {
    saveProgress: vi.fn(),
    getProgress: vi.fn(),
    createBookmark: vi.fn(),
    getBookmarks: vi.fn(),
    deleteBookmark: vi.fn(),
    createHighlight: vi.fn(),
    getHighlights: vi.fn(),
    updateHighlight: vi.fn(),
    deleteHighlight: vi.fn(),
    createNote: vi.fn(),
    getNotes: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
  };

  const user = { id: 'user-1' };

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new (ReaderController as any)(mockReaderService);
  });

  // ========================
  // Reading Progress
  // ========================

  describe('POST /reader/progress', () => {
    const dto = { bookId: 'book-1', currentChapter: 3, currentPosition: 1500, percentage: 45 };

    it('should save progress and return result', async () => {
      const expected = { id: 'rp-1', userId: 'user-1', ...dto };
      mockReaderService.saveProgress.mockResolvedValue(expected);

      const result = await controller.saveProgress(user, dto);

      expect(result).toEqual(expected);
    });

    it('should pass userId from @CurrentUser decorator', async () => {
      mockReaderService.saveProgress.mockResolvedValue({});

      await controller.saveProgress(user, dto);

      expect(mockReaderService.saveProgress).toHaveBeenCalledWith('user-1', dto);
    });

    it('should propagate service errors', async () => {
      mockReaderService.saveProgress.mockRejectedValue(
        new NotFoundException('წიგნი ვერ მოიძებნა'),
      );

      await expect(controller.saveProgress(user, dto))
        .rejects.toThrow(NotFoundException);
    });

    it('should call service with correct DTO fields', async () => {
      mockReaderService.saveProgress.mockResolvedValue({});

      await controller.saveProgress(user, dto);

      expect(mockReaderService.saveProgress).toHaveBeenCalledWith('user-1', {
        bookId: 'book-1',
        currentChapter: 3,
        currentPosition: 1500,
        percentage: 45,
      });
    });
  });

  describe('GET /reader/progress/:bookId', () => {
    it('should return progress for book', async () => {
      const progress = { id: 'rp-1', currentChapter: 5, percentage: 75 };
      mockReaderService.getProgress.mockResolvedValue(progress);

      const result = await controller.getProgress(user, 'book-1');

      expect(result).toEqual(progress);
    });

    it('should return null when no progress exists', async () => {
      mockReaderService.getProgress.mockResolvedValue(null);

      const result = await controller.getProgress(user, 'book-1');

      expect(result).toBeNull();
    });

    it('should pass userId and bookId to service', async () => {
      mockReaderService.getProgress.mockResolvedValue(null);

      await controller.getProgress(user, 'book-1');

      expect(mockReaderService.getProgress).toHaveBeenCalledWith('user-1', 'book-1');
    });

    it('should propagate NotFoundException', async () => {
      mockReaderService.getProgress.mockRejectedValue(new NotFoundException());

      await expect(controller.getProgress(user, 'nonexistent'))
        .rejects.toThrow(NotFoundException);
    });
  });

  // ========================
  // Bookmarks
  // ========================

  describe('POST /reader/bookmarks', () => {
    const dto = { bookId: 'book-1', chapterNumber: 1, position: 500, label: 'Important' };

    it('should create bookmark', async () => {
      const expected = { id: 'bm-1', userId: 'user-1', ...dto };
      mockReaderService.createBookmark.mockResolvedValue(expected);

      const result = await controller.createBookmark(user, dto);

      expect(result).toEqual(expected);
    });

    it('should pass userId from token', async () => {
      mockReaderService.createBookmark.mockResolvedValue({});

      await controller.createBookmark(user, dto);

      expect(mockReaderService.createBookmark).toHaveBeenCalledWith('user-1', dto);
    });

    it('should propagate ConflictException on duplicate', async () => {
      mockReaderService.createBookmark.mockRejectedValue(
        new ConflictException('ეს bookmark უკვე არსებობს'),
      );

      await expect(controller.createBookmark(user, dto))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('GET /reader/bookmarks/:bookId', () => {
    it('should return bookmarks array', async () => {
      const bookmarks = [{ id: 'bm-1' }, { id: 'bm-2' }];
      mockReaderService.getBookmarks.mockResolvedValue(bookmarks);

      const result = await controller.getBookmarks(user, 'book-1', 1, 100);

      expect(result).toHaveLength(2);
    });

    it('should return empty array when no bookmarks', async () => {
      mockReaderService.getBookmarks.mockResolvedValue([]);

      const result = await controller.getBookmarks(user, 'book-1', 1, 100);

      expect(result).toEqual([]);
    });

    it('should pass userId to service', async () => {
      mockReaderService.getBookmarks.mockResolvedValue([]);

      await controller.getBookmarks(user, 'book-1', 1, 100);

      expect(mockReaderService.getBookmarks).toHaveBeenCalledWith('user-1', 'book-1', 1, 100);
    });
  });

  describe('DELETE /reader/bookmarks/:id', () => {
    it('should delete bookmark', async () => {
      mockReaderService.deleteBookmark.mockResolvedValue({ id: 'bm-1' });

      const result = await controller.deleteBookmark(user, 'bm-1');

      expect(result.id).toBe('bm-1');
    });

    it('should pass userId for ownership check', async () => {
      mockReaderService.deleteBookmark.mockResolvedValue({});

      await controller.deleteBookmark(user, 'bm-1');

      expect(mockReaderService.deleteBookmark).toHaveBeenCalledWith('user-1', 'bm-1');
    });

    it('should propagate NotFoundException', async () => {
      mockReaderService.deleteBookmark.mockRejectedValue(new NotFoundException());

      await expect(controller.deleteBookmark(user, 'nonexistent'))
        .rejects.toThrow(NotFoundException);
    });

    it('should propagate ForbiddenException', async () => {
      mockReaderService.deleteBookmark.mockRejectedValue(new ForbiddenException());

      await expect(controller.deleteBookmark(user, 'bm-1'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  // ========================
  // Highlights
  // ========================

  describe('POST /reader/highlights', () => {
    const dto = {
      bookId: 'book-1',
      chapterNumber: 2,
      startPosition: 100,
      endPosition: 200,
      selectedText: 'highlighted text',
    };

    it('should create highlight with default color', async () => {
      const expected = { id: 'hl-1', ...dto, color: 'yellow' };
      mockReaderService.createHighlight.mockResolvedValue(expected);

      const result = await controller.createHighlight(user, dto);

      expect(result.color).toBe('yellow');
    });

    it('should create highlight with specified color', async () => {
      const expected = { id: 'hl-1', ...dto, color: 'green' };
      mockReaderService.createHighlight.mockResolvedValue(expected);

      const result = await controller.createHighlight(user, { ...dto, color: 'green' });

      expect(result.color).toBe('green');
    });

    it('should pass userId from token', async () => {
      mockReaderService.createHighlight.mockResolvedValue({});

      await controller.createHighlight(user, dto);

      expect(mockReaderService.createHighlight).toHaveBeenCalledWith('user-1', dto);
    });

    it('should propagate BadRequestException', async () => {
      mockReaderService.createHighlight.mockRejectedValue(new BadRequestException());

      await expect(controller.createHighlight(user, dto))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('GET /reader/highlights/:bookId', () => {
    it('should return highlights array', async () => {
      const highlights = [{ id: 'hl-1', notes: [] }];
      mockReaderService.getHighlights.mockResolvedValue(highlights);

      const result = await controller.getHighlights(user, 'book-1', 1, 100);

      expect(result).toHaveLength(1);
    });

    it('should return empty array', async () => {
      mockReaderService.getHighlights.mockResolvedValue([]);

      const result = await controller.getHighlights(user, 'book-1', 1, 100);

      expect(result).toEqual([]);
    });
  });

  describe('PATCH /reader/highlights/:id', () => {
    it('should update highlight color', async () => {
      mockReaderService.updateHighlight.mockResolvedValue({ id: 'hl-1', color: 'blue' });

      const result = await controller.updateHighlight(user, 'hl-1', { color: 'blue' });

      expect(result.color).toBe('blue');
    });

    it('should pass userId for ownership check', async () => {
      mockReaderService.updateHighlight.mockResolvedValue({});

      await controller.updateHighlight(user, 'hl-1', { color: 'red' });

      expect(mockReaderService.updateHighlight).toHaveBeenCalledWith('user-1', 'hl-1', { color: 'red' });
    });

    it('should propagate NotFoundException', async () => {
      mockReaderService.updateHighlight.mockRejectedValue(new NotFoundException());

      await expect(controller.updateHighlight(user, 'nonexistent', { color: 'blue' }))
        .rejects.toThrow(NotFoundException);
    });

    it('should propagate ForbiddenException', async () => {
      mockReaderService.updateHighlight.mockRejectedValue(new ForbiddenException());

      await expect(controller.updateHighlight(user, 'hl-1', { color: 'blue' }))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('DELETE /reader/highlights/:id', () => {
    it('should delete highlight', async () => {
      mockReaderService.deleteHighlight.mockResolvedValue({ id: 'hl-1' });

      const result = await controller.deleteHighlight(user, 'hl-1');

      expect(result.id).toBe('hl-1');
    });

    it('should propagate NotFoundException', async () => {
      mockReaderService.deleteHighlight.mockRejectedValue(new NotFoundException());

      await expect(controller.deleteHighlight(user, 'nonexistent'))
        .rejects.toThrow(NotFoundException);
    });

    it('should propagate ForbiddenException', async () => {
      mockReaderService.deleteHighlight.mockRejectedValue(new ForbiddenException());

      await expect(controller.deleteHighlight(user, 'hl-1'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  // ========================
  // Notes
  // ========================

  describe('POST /reader/notes', () => {
    const dto = { bookId: 'book-1', chapterNumber: 1, content: 'My note' };

    it('should create standalone note', async () => {
      const expected = { id: 'n-1', ...dto, highlightId: null };
      mockReaderService.createNote.mockResolvedValue(expected);

      const result = await controller.createNote(user, dto);

      expect(result.highlightId).toBeNull();
    });

    it('should create note attached to highlight', async () => {
      const dtoWithHighlight = { ...dto, highlightId: 'hl-1' };
      const expected = { id: 'n-1', ...dtoWithHighlight };
      mockReaderService.createNote.mockResolvedValue(expected);

      const result = await controller.createNote(user, dtoWithHighlight);

      expect(result.highlightId).toBe('hl-1');
    });

    it('should pass userId from token', async () => {
      mockReaderService.createNote.mockResolvedValue({});

      await controller.createNote(user, dto);

      expect(mockReaderService.createNote).toHaveBeenCalledWith('user-1', dto);
    });

    it('should propagate NotFoundException for invalid highlightId', async () => {
      mockReaderService.createNote.mockRejectedValue(new NotFoundException());

      await expect(controller.createNote(user, { ...dto, highlightId: 'bad' }))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('GET /reader/notes/:bookId', () => {
    it('should return notes array', async () => {
      const notes = [{ id: 'n-1', content: 'note', highlight: null }];
      mockReaderService.getNotes.mockResolvedValue(notes);

      const result = await controller.getNotes(user, 'book-1', 1, 100);

      expect(result).toHaveLength(1);
    });

    it('should return empty array', async () => {
      mockReaderService.getNotes.mockResolvedValue([]);

      const result = await controller.getNotes(user, 'book-1', 1, 100);

      expect(result).toEqual([]);
    });

    it('should include highlight relation', async () => {
      const notes = [{ id: 'n-1', highlight: { id: 'hl-1', selectedText: 'text' } }];
      mockReaderService.getNotes.mockResolvedValue(notes);

      const result = await controller.getNotes(user, 'book-1', 1, 100);

      expect(result[0].highlight).toBeDefined();
    });
  });

  describe('PATCH /reader/notes/:id', () => {
    it('should update note content', async () => {
      mockReaderService.updateNote.mockResolvedValue({ id: 'n-1', content: 'updated' });

      const result = await controller.updateNote(user, 'n-1', { content: 'updated' });

      expect(result.content).toBe('updated');
    });

    it('should pass userId for ownership check', async () => {
      mockReaderService.updateNote.mockResolvedValue({});

      await controller.updateNote(user, 'n-1', { content: 'updated' });

      expect(mockReaderService.updateNote).toHaveBeenCalledWith('user-1', 'n-1', { content: 'updated' });
    });

    it('should propagate NotFoundException', async () => {
      mockReaderService.updateNote.mockRejectedValue(new NotFoundException());

      await expect(controller.updateNote(user, 'nonexistent', { content: 'x' }))
        .rejects.toThrow(NotFoundException);
    });

    it('should propagate ForbiddenException', async () => {
      mockReaderService.updateNote.mockRejectedValue(new ForbiddenException());

      await expect(controller.updateNote(user, 'n-1', { content: 'x' }))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('DELETE /reader/notes/:id', () => {
    it('should delete note', async () => {
      mockReaderService.deleteNote.mockResolvedValue({ id: 'n-1' });

      const result = await controller.deleteNote(user, 'n-1');

      expect(result.id).toBe('n-1');
    });

    it('should propagate NotFoundException', async () => {
      mockReaderService.deleteNote.mockRejectedValue(new NotFoundException());

      await expect(controller.deleteNote(user, 'nonexistent'))
        .rejects.toThrow(NotFoundException);
    });

    it('should propagate ForbiddenException', async () => {
      mockReaderService.deleteNote.mockRejectedValue(new ForbiddenException());

      await expect(controller.deleteNote(user, 'n-1'))
        .rejects.toThrow(ForbiddenException);
    });
  });
});
