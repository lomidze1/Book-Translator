import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { BooksService } from '../../src/books/books.service';

// Mock global fetch
const originalFetch = global.fetch;
global.fetch = vi.fn();

afterAll(() => {
  global.fetch = originalFetch;
});

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
    userBook: {
      create: vi.fn(),
      createMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  };

  const mockS3Service = {
    upload: vi.fn().mockResolvedValue('books/book-1/original.pdf'),
    getPresignedUrl: vi.fn().mockResolvedValue('https://presigned-url.com'),
    delete: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
    generateBookKey: vi.fn().mockReturnValue('books/book-1/original.pdf'),
    generateTranslationKey: vi.fn().mockReturnValue('books/book-1/translations/tr-1/chapter-1.txt'),
    generateAudioKey: vi.fn().mockReturnValue('books/book-1/audio/ab-1/chapter-1.mp3'),
  };

  const mockConfigService = {
    get: vi.fn((key: string) => (key === 'ENABLE_BOOK_RESALE' ? 'true' : process.env[key])),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    booksService = new (BooksService as any)(mockPrismaService, mockS3Service, undefined, mockConfigService);
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
      mockPrismaService.userBook.findFirst.mockResolvedValue({ id: 'ub1', userId: 'user-1', bookId: 'b1' });
      mockPrismaService.book.update.mockResolvedValue({ id: 'b1', title: 'New Title' });

      const result = await booksService.update('b1', { title: 'New Title' }, 'user-1');
      expect(result.title).toBe('New Title');
    });

    it('should throw NotFoundException when updating non-existent book', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue(null);

      await expect(booksService.update('nonexistent', { title: 'X' }, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when user does not own the book', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue({ id: 'b1', title: 'Book' });
      mockPrismaService.userBook.findFirst.mockResolvedValue(null);

      await expect(booksService.update('b1', { title: 'X' }, 'user-999')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow update when user owns the book', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue({ id: 'b1', title: 'Old' });
      mockPrismaService.userBook.findFirst.mockResolvedValue({ id: 'ub-1' });
      mockPrismaService.book.update.mockResolvedValue({ id: 'b1', title: 'New' });

      const result = await booksService.update('b1', { title: 'New' }, 'user-1');
      expect(result.title).toBe('New');
    });

    // Regression: duplicate-hash uploads attach unrelated users to the same
    // Book row; a co-owner must not rewrite shared metadata for everyone.
    it('should throw ForbiddenException when the book has co-owners', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue({ id: 'b1', title: 'Old' });
      mockPrismaService.userBook.findFirst.mockResolvedValue({ id: 'ub-1' });
      mockPrismaService.userBook.count.mockResolvedValue(1);

      await expect(booksService.update('b1', { title: 'X' }, 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrismaService.book.update).not.toHaveBeenCalled();
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
      mockPrismaService.userBook.findFirst.mockResolvedValue({ id: 'ub-1', userId: 'user-1' });
      mockPrismaService.userBook.count.mockResolvedValue(0);

      await expect(booksService.remove('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user does not own the book', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue({ id: 'b1' });
      mockPrismaService.userBook.findFirst.mockResolvedValue(null);

      await expect(booksService.remove('b1', 'user-999')).rejects.toThrow(ForbiddenException);
    });

    // Regression: User B uploads the same file as User A and becomes a
    // co-owner of the same Book row. B's delete must not cascade away A's
    // translations/progress — it should only detach B's own library rows.
    it('should only detach caller rows when the book has co-owners', async () => {
      mockPrismaService.userBook.findFirst.mockResolvedValue({ id: 'ub-b', userId: 'user-b' });
      mockPrismaService.userBook.count.mockResolvedValue(1);
      mockPrismaService.userBook.deleteMany.mockResolvedValue({ count: 1 });

      const result = await booksService.remove('b1', 'user-b');

      expect(mockPrismaService.userBook.deleteMany).toHaveBeenCalledWith({
        where: { bookId: 'b1', userId: 'user-b' },
      });
      expect(mockPrismaService.book.delete).not.toHaveBeenCalled();
      expect(mockS3Service.delete).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'b1', removedFromLibrary: true });
    });
  });

  // ========================
  // Aggregated Search
  // ========================

  describe('search', () => {
    it('should aggregate results from Google, OpenLibrary, and database', async () => {
      // Mock Google Books
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{
            id: 'g1',
            volumeInfo: {
              title: 'Google Book',
              authors: ['Author'],
              industryIdentifiers: [{ type: 'ISBN_13', identifier: '9781111111111' }],
            },
          }],
        }),
      });

      // Mock Open Library
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          docs: [{
            title: 'OL Book',
            author_name: ['OL Author'],
            isbn: ['9782222222222'],
            key: '/works/OL1',
          }],
        }),
      });

      // Mock database search
      mockPrismaService.book.findMany.mockResolvedValue([
        { id: 'db1', title: 'DB Book', translations: [] },
      ]);

      // Mock ISBN lookup for enrichment (no match)
      mockPrismaService.book.findUnique.mockResolvedValue(null);

      const result = await booksService.search({ q: 'test', limit: 10 });

      expect(result.external.length).toBeGreaterThanOrEqual(1);
      expect(result.database).toHaveLength(1);
      expect(result.total).toBeGreaterThan(0);
    });

    it('should deduplicate external results by ISBN', async () => {
      const sharedIsbn = '9781234567890';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{
            id: 'g1',
            volumeInfo: {
              title: 'Same Book Google',
              industryIdentifiers: [{ type: 'ISBN_13', identifier: sharedIsbn }],
            },
          }],
        }),
      });

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          docs: [{
            title: 'Same Book OL',
            isbn: [sharedIsbn],
            key: '/works/OL1',
          }],
        }),
      });

      mockPrismaService.book.findMany.mockResolvedValue([]);
      mockPrismaService.book.findUnique.mockResolvedValue(null);

      const result = await booksService.search({ q: 'test', limit: 10 });

      // Should be deduplicated — only one result for that ISBN
      const isbnResults = result.external.filter(b => b.isbn === sharedIsbn);
      expect(isbnResults).toHaveLength(1);
    });

    it('should handle all external APIs failing gracefully', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));
      mockPrismaService.book.findMany.mockResolvedValue([{ id: 'db1', title: 'DB' }]);

      const result = await booksService.search({ q: 'test', limit: 10 });

      expect(result.external).toHaveLength(0);
      expect(result.database).toHaveLength(1);
    });
  });

  // ========================
  // Search — Individual APIs
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
  // File Upload
  // ========================

  describe('handleUpload', () => {
    const mockFile = {
      originalname: 'clean-code.pdf',
      mimetype: 'application/pdf',
      size: 1024 * 1024,
      buffer: Buffer.from('fake pdf content'),
    } as Express.Multer.File;

    const userId = 'user-1';

    it('should upload new book successfully', async () => {
      // No duplicate
      mockPrismaService.book.findUnique.mockResolvedValue(null);
      // Create book
      mockPrismaService.book.create.mockResolvedValue({
        id: 'new-book',
        title: 'clean code',
        originalFormat: 'PDF',
      });
      // Update with S3 URL
      mockPrismaService.book.update.mockResolvedValue({});
      // Create UserBook
      mockPrismaService.userBook.create.mockResolvedValue({});

      const result = await booksService.handleUpload(mockFile, userId);

      expect(result.duplicate).toBe(false);
      expect(result.book.id).toBe('new-book');
      expect(mockS3Service.upload).toHaveBeenCalled();
      expect(mockS3Service.generateBookKey).toHaveBeenCalledWith('new-book', 'clean-code.pdf');
      expect(mockPrismaService.userBook.create).toHaveBeenCalledWith({
        data: { userId, bookId: 'new-book', type: 'UPLOADED' },
      });
    });

    it('should detect duplicate by file hash', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue({
        id: 'existing-book',
        title: 'Existing Book',
        translations: [],
      });

      const result = await booksService.handleUpload(mockFile, userId);

      expect(result.duplicate).toBe(true);
      expect(result.book.id).toBe('existing-book');
      expect(result.translationAvailable).toBe(false);
      expect(mockS3Service.upload).not.toHaveBeenCalled();
    });

    it('should detect duplicate with available translation', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue({
        id: 'existing-book',
        title: 'Existing Book',
        translations: [{ id: 'tr-1', targetLanguage: 'ka' }],
      });

      const result = await booksService.handleUpload(mockFile, userId);

      expect(result.duplicate).toBe(true);
      expect(result.translationAvailable).toBe(true);
      expect(result.message).toBe('DUPLICATE_TRANSLATED');
    });

    it('should hide available translation when resale is disabled', async () => {
      mockConfigService.get.mockImplementationOnce(() => undefined);
      mockPrismaService.book.findUnique.mockResolvedValue({
        id: 'existing-book',
        title: 'Existing Book',
        translations: [{ id: 'tr-1', targetLanguage: 'ka' }],
      });

      const result = await booksService.handleUpload(mockFile, userId);

      expect(result.duplicate).toBe(true);
      expect(result.translationAvailable).toBe(false);
      expect(result.message).toBe('DUPLICATE_EXISTS');
    });

    it('should grant ownership to the uploader on a duplicate upload', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue({
        id: 'existing-book',
        title: 'Existing Book',
        translations: [],
      });

      await booksService.handleUpload(mockFile, userId);

      expect(mockPrismaService.userBook.createMany).toHaveBeenCalledWith({
        data: [{ userId, bookId: 'existing-book', type: 'UPLOADED' }],
        skipDuplicates: true,
      });
    });

    it('should not create ownership on a duplicate upload without a user', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue({
        id: 'existing-book',
        title: 'Existing Book',
        translations: [],
      });

      await booksService.handleUpload(mockFile, undefined);

      expect(mockPrismaService.userBook.createMany).not.toHaveBeenCalled();
    });

    it('should extract title from filename', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue(null);
      mockPrismaService.book.create.mockResolvedValue({ id: 'new-book' });
      mockPrismaService.book.update.mockResolvedValue({});
      mockPrismaService.userBook.create.mockResolvedValue({});

      const fileWithDashes = {
        ...mockFile,
        originalname: 'my-great-book.pdf',
      } as Express.Multer.File;

      await booksService.handleUpload(fileWithDashes, userId);

      expect(mockPrismaService.book.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'my great book',
        }),
      });
    });

    it('should detect format from extension', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue(null);
      mockPrismaService.book.create.mockResolvedValue({ id: 'new-book' });
      mockPrismaService.book.update.mockResolvedValue({});
      mockPrismaService.userBook.create.mockResolvedValue({});

      const epubFile = {
        ...mockFile,
        originalname: 'book.epub',
      } as Express.Multer.File;

      await booksService.handleUpload(epubFile, userId);

      expect(mockPrismaService.book.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          originalFormat: 'EPUB',
        }),
      });
    });

    it('should store file size', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue(null);
      mockPrismaService.book.create.mockResolvedValue({ id: 'new-book' });
      mockPrismaService.book.update.mockResolvedValue({});
      mockPrismaService.userBook.create.mockResolvedValue({});

      await booksService.handleUpload(mockFile, userId);

      expect(mockPrismaService.book.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fileSize: mockFile.size,
        }),
      });
    });

    it('should update book with S3 key after upload', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue(null);
      mockPrismaService.book.create.mockResolvedValue({ id: 'new-book' });
      mockPrismaService.book.update.mockResolvedValue({});
      mockPrismaService.userBook.create.mockResolvedValue({});

      await booksService.handleUpload(mockFile, userId);

      expect(mockPrismaService.book.update).toHaveBeenCalledWith({
        where: { id: 'new-book' },
        data: { originalFileUrl: 'books/book-1/original.pdf' },
      });
    });

    it('should rollback book record when S3 upload fails', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue(null);
      mockPrismaService.book.create.mockResolvedValue({ id: 'orphan-book' });
      mockS3Service.upload.mockRejectedValueOnce(new Error('S3 failure'));
      mockPrismaService.book.delete.mockResolvedValue({});

      await expect(booksService.handleUpload(mockFile, userId)).rejects.toThrow('S3 failure');

      // Verify rollback — orphaned book record deleted
      expect(mockPrismaService.book.delete).toHaveBeenCalledWith({
        where: { id: 'orphan-book' },
      });
      expect(mockPrismaService.userBook.create).not.toHaveBeenCalled();
    });

    it('should sanitize HTML in filename', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue(null);
      mockPrismaService.book.create.mockResolvedValue({ id: 'new-book' });
      mockPrismaService.book.update.mockResolvedValue({});
      mockPrismaService.userBook.create.mockResolvedValue({});

      const xssFile = {
        ...mockFile,
        originalname: '<script>alert(1)</script>.pdf',
      } as Express.Multer.File;

      await booksService.handleUpload(xssFile, userId);

      expect(mockPrismaService.book.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: expect.not.stringContaining('<script>'),
        }),
      });
    });

    it('should sanitize path traversal in filename', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue(null);
      mockPrismaService.book.create.mockResolvedValue({ id: 'new-book' });
      mockPrismaService.book.update.mockResolvedValue({});
      mockPrismaService.userBook.create.mockResolvedValue({});

      const traversalFile = {
        ...mockFile,
        originalname: '../../../etc/passwd.pdf',
      } as Express.Multer.File;

      await booksService.handleUpload(traversalFile, userId);

      expect(mockPrismaService.book.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: expect.not.stringContaining('..'),
        }),
      });
    });

    it('should use server-derived Content-Type instead of client MIME', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue(null);
      mockPrismaService.book.create.mockResolvedValue({ id: 'new-book' });
      mockPrismaService.book.update.mockResolvedValue({});
      mockPrismaService.userBook.create.mockResolvedValue({});

      await booksService.handleUpload(mockFile, userId);

      // Should use server-derived 'application/pdf' not client mimetype
      expect(mockS3Service.upload).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Buffer),
        'application/pdf',
      );
    });

    it('should return only book id in duplicate response (not full book)', async () => {
      mockPrismaService.book.findUnique.mockResolvedValue({
        id: 'existing-book',
        title: 'Secret Title',
        fileHash: 'abc',
        translations: [],
      });

      const result = await booksService.handleUpload(mockFile, userId);

      expect(result.duplicate).toBe(true);
      // Should not expose full book metadata
      expect(result.book).toEqual({ id: 'existing-book' });
      expect((result.book as any).title).toBeUndefined();
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
