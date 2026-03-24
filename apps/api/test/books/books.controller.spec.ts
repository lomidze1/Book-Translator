import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BooksController } from '../../src/books/books.controller';

describe('BooksController', () => {
  let controller: BooksController;

  const mockBooksService = {
    search: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new (BooksController as any)(mockBooksService);
  });

  describe('search', () => {
    it('should call booksService.search with query', async () => {
      const dto = { q: 'clean code', limit: 10 };
      const expected = { external: [], database: [], total: 0 };
      mockBooksService.search.mockResolvedValue(expected);

      const result = await controller.search(dto);

      expect(mockBooksService.search).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expected);
    });
  });

  describe('findAll', () => {
    it('should return paginated books', async () => {
      const dto = { page: 1, limit: 20 };
      const expected = { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
      mockBooksService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(dto);

      expect(result.meta).toBeDefined();
      expect(mockBooksService.findAll).toHaveBeenCalledWith(dto);
    });
  });

  describe('findOne', () => {
    it('should return a single book', async () => {
      const book = { id: 'b1', title: 'Clean Code' };
      mockBooksService.findOne.mockResolvedValue(book);

      const result = await controller.findOne('b1');

      expect(result.title).toBe('Clean Code');
      expect(mockBooksService.findOne).toHaveBeenCalledWith('b1');
    });
  });

  describe('create', () => {
    it('should create a book', async () => {
      const dto = { title: 'New Book', originalFormat: 'PDF' as any };
      mockBooksService.create.mockResolvedValue({ id: 'new-1', ...dto });

      const result = await controller.create(dto);

      expect(result.id).toBe('new-1');
      expect(mockBooksService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('should update a book', async () => {
      const dto = { title: 'Updated Title' };
      mockBooksService.update.mockResolvedValue({ id: 'b1', ...dto });

      const result = await controller.update('b1', dto);

      expect(result.title).toBe('Updated Title');
      expect(mockBooksService.update).toHaveBeenCalledWith('b1', dto);
    });
  });

  describe('remove', () => {
    it('should delete a book', async () => {
      mockBooksService.remove.mockResolvedValue({ id: 'b1' });

      const result = await controller.remove('b1');

      expect(result.id).toBe('b1');
      expect(mockBooksService.remove).toHaveBeenCalledWith('b1');
    });
  });
});
