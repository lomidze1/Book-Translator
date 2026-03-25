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
    handleUpload: vi.fn(),
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
    it('should update a book with ownership check', async () => {
      const dto = { title: 'Updated Title' };
      const mockUser = { id: 'user-1' };
      mockBooksService.update.mockResolvedValue({ id: 'b1', ...dto });

      const result = await controller.update('b1', dto, mockUser);

      expect(result.title).toBe('Updated Title');
      expect(mockBooksService.update).toHaveBeenCalledWith('b1', dto, 'user-1');
    });
  });

  describe('remove', () => {
    it('should delete a book with ownership check', async () => {
      const mockUser = { id: 'user-1' };
      mockBooksService.remove.mockResolvedValue({ id: 'b1' });

      const result = await controller.remove('b1', mockUser);

      expect(result.id).toBe('b1');
      expect(mockBooksService.remove).toHaveBeenCalledWith('b1', 'user-1');
    });
  });

  // ========================
  // Upload
  // ========================

  describe('upload', () => {
    const mockFile = {
      originalname: 'test.pdf',
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.from('pdf data'),
    } as Express.Multer.File;

    const mockUser = { id: 'user-1' };

    it('should call handleUpload with file and userId', async () => {
      const expected = { duplicate: false, book: { id: 'b1' }, message: 'Success' };
      mockBooksService.handleUpload.mockResolvedValue(expected);

      const result = await controller.upload(mockFile, mockUser);

      expect(mockBooksService.handleUpload).toHaveBeenCalledWith(mockFile, 'user-1');
      expect(result).toEqual(expected);
    });

    it('should return duplicate info when book exists', async () => {
      const expected = {
        duplicate: true,
        book: { id: 'existing' },
        translationAvailable: true,
        message: 'ეს წიგნი უკვე ნათარგმნია.',
      };
      mockBooksService.handleUpload.mockResolvedValue(expected);

      const result = await controller.upload(mockFile, mockUser);

      expect(result.duplicate).toBe(true);
      expect(result.translationAvailable).toBe(true);
    });
  });
});
