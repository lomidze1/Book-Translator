import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { BooksService } from '../../src/books/books.service';

// Mock global fetch
global.fetch = vi.fn();

describe('BooksService', () => {
  let booksService: BooksService;

  const mockPrismaService = {
    book: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    booksService = new (BooksService as any)(mockPrismaService);
  });

  // ========================
  // CRUD
  // ========================

  describe('create', () => {
    const createDto = {
      title: 'Clean Code',
      author: 'Robert C. Martin',
      originalFormat: 'PDF' as any,
    };

    it('should create a book successfully', async () => {
      mockPrismaService.book.create.mockResolvedValue({ id: 'book-1', ...createDto });

      const result = await booksService.create(createDto);

      expect(result.id).toBe('book-1');
      expect(result.title).toBe('Clean Code');
      expect(mockPrismaService.book.create).toHaveBeenCalled();
    });

    it('should throw ConflictException when ISBN duplicate exists', async () => {
      const dtoWithIsbn = { ...createDto, isbn: '9780132350884' };
      mockPrismaService.book.findUnique.mockResolvedValue({ id: 'existing', title: 'Existing' });

      await expect(booksService.create(dtoWithIsbn)).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when fileHash duplicate exists', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue({ id: 'existing', title: 'Existing' });

      await expect(booksService.create(createDto, 'abc123hash')).rejects.toThrow(ConflictException);
    });

    it('should allow creation when no duplicates', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue(null);
      mockPrismaService.book.create.mockResolvedValue({ id: 'new-book', ...createDto });

      const result = await booksService.create(createDto, 'unique-hash');
      expect(result.id).toBe('new-book');
    });
  });

  describe('findAll', () => {
    it('should return paginated books', async () => {
      const books = [
        { id: 'b1', title: 'Book 1' },
        { id: 'b2', title: 'Book 2' },
      ];
      mockPrismaService.book.findMany.mockResolvedValue(books);
      mockPrismaService.book.count.mockResolvedValue(50);

      const result = await booksService.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(50);
      expect(result.meta.totalPages).toBe(3);
    });

    it('should use default pagination values', async () => {
      mockPrismaService.book.findMany.mockResolvedValue([]);
      mockPrismaService.book.count.mockResolvedValue(0);

      const result = await booksService.findAll({});

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
    });
  });

  describe('findOne', () => {
    it('should return a book by id', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue({
        id: 'book-1',
        title: 'Clean Code',
        translations: [],
        chapters: [],
      });

      const result = await booksService.findOne('book-1');
      expect(result.title).toBe('Clean Code');
    });

    it('should throw NotFoundException when book not found', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue(null);

      await expect(booksService.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a book', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue({ id: 'b1', title: 'Old' });
      mockPrismaService.book.update.mockResolvedValue({ id: 'b1', title: 'New Title' });

      const result = await booksService.update('b1', { title: 'New Title' });
      expect(result.title).toBe('New Title');
    });

    it('should throw NotFoundException when updating non-existent book', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue(null);

      await expect(booksService.update('nonexistent', { title: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should delete a book', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue({ id: 'b1' });
      mockPrismaService.book.delete.mockResolvedValue({ id: 'b1' });

      const result = await booksService.remove('b1');
      expect(result.id).toBe('b1');
    });

    it('should throw NotFoundException when deleting non-existent book', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue(null);

      await expect(booksService.remove('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ========================
  // Search
  // ========================

  describe('searchGoogleBooks', () => {
    it('should return parsed results from Google Books API', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'gbook-1',
              volumeInfo: {
                title: 'Test Book',
                authors: ['Author One'],
                description: 'A test book',
                pageCount: 200,
                language: 'en',
                industryIdentifiers: [{ type: 'ISBN_13', identifier: '9781234567890' }],
                imageLinks: { thumbnail: 'https://example.com/cover.jpg' },
              },
            },
          ],
        }),
      });

      const results = await booksService.searchGoogleBooks('test', 10);

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Test Book');
      expect(results[0].source).toBe('google');
      expect(results[0].isbn).toBe('9781234567890');
    });

    it('should return empty array on API error', async () => {
      (global.fetch as any).mockResolvedValue({ ok: false });

      const results = await booksService.searchGoogleBooks('test', 10);
      expect(results).toEqual([]);
    });

    it('should return empty array on network error', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const results = await booksService.searchGoogleBooks('test', 10);
      expect(results).toEqual([]);
    });
  });

  describe('searchOpenLibrary', () => {
    it('should return parsed results from Open Library API', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          docs: [
            {
              title: 'OL Book',
              author_name: ['OL Author'],
              isbn: ['9789876543210'],
              cover_i: 12345,
              key: '/works/OL123',
              number_of_pages_median: 300,
            },
          ],
        }),
      });

      const results = await booksService.searchOpenLibrary('test', 10);

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('OL Book');
      expect(results[0].source).toBe('openlibrary');
      expect(results[0].coverUrl).toContain('12345');
    });

    it('should return empty array on API error', async () => {
      (global.fetch as any).mockResolvedValue({ ok: false });

      const results = await booksService.searchOpenLibrary('test', 10);
      expect(results).toEqual([]);
    });
  });

  describe('searchDatabase', () => {
    it('should search books by title, author, or ISBN', async () => {
      mockPrismaService.book.findMany.mockResolvedValue([{ id: 'b1', title: 'Match' }]);

      const results = await booksService.searchDatabase('Match');

      expect(results).toHaveLength(1);
      expect(mockPrismaService.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: expect.any(Array) }),
        }),
      );
    });
  });

  // ========================
  // Helpers
  // ========================

  describe('generateFileHash', () => {
    it('should generate consistent SHA-256 hash', () => {
      const buffer = Buffer.from('test content');
      const hash1 = booksService.generateFileHash(buffer);
      const hash2 = booksService.generateFileHash(buffer);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex
    });

    it('should generate different hashes for different content', () => {
      const hash1 = booksService.generateFileHash(Buffer.from('content A'));
      const hash2 = booksService.generateFileHash(Buffer.from('content B'));

      expect(hash1).not.toBe(hash2);
    });
  });
});
