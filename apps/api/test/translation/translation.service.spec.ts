import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { TranslationService } from '../../src/translation/translation.service';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_DEV_SHORTCUTS = process.env.ENABLE_DEV_SHORTCUTS;

// Mock BullMQ
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  })),
}));

describe('TranslationService', () => {
  let service: TranslationService;

  const mockPrisma = {
    book: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    translation: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    translatedChapter: {
      upsert: vi.fn(),
    },
    userBook: {
      create: vi.fn(),
    },
    chapter: {
      create: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  const mockS3 = {
    getPresignedUrl: vi.fn(),
    generateTranslationKey: vi.fn(),
    upload: vi.fn(),
  };

  const mockParsing = {
    parse: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Dev shortcuts now require both env vars (see common/dev-shortcuts.ts).
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_DEV_SHORTCUTS = 'true';
    service = new (TranslationService as any)(mockPrisma, mockS3, mockParsing);
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (ORIGINAL_DEV_SHORTCUTS === undefined) {
      delete process.env.ENABLE_DEV_SHORTCUTS;
    } else {
      process.env.ENABLE_DEV_SHORTCUTS = ORIGINAL_DEV_SHORTCUTS;
    }
  });

  describe('createTranslation', () => {
    it('should create a translation for an existing book', async () => {
      mockPrisma.book.findUnique.mockResolvedValue({
        id: 'book-1',
        originalFileUrl: 's3://key',
        originalFormat: 'PDF',
        userBooks: [{ id: 'ub-1' }],
        _count: { chapters: 1 },
      });
      mockPrisma.translation.findFirst.mockResolvedValue(null);
      mockPrisma.translation.create.mockResolvedValue({
        id: 'tr-1',
        bookId: 'book-1',
        status: 'PAID',
        progress: 0,
      });
      // startTranslation is called in dev mode after create
      mockPrisma.translation.findUnique.mockResolvedValue({
        id: 'tr-1',
        bookId: 'book-1',
        status: 'PAID',
      });

      const result = await service.createTranslation('book-1', 'user-1');

      expect(result.id).toBe('tr-1');
      expect(result.status).toBe('PAID');
      expect(mockPrisma.translation.create).toHaveBeenCalledWith({
        data: {
          bookId: 'book-1',
          sourceLanguage: 'en',
          targetLanguage: 'ka',
          translationType: 'FAST',
          status: 'PAID',
          progress: 0,
        },
      });
    });

    it('should throw NotFoundException if book does not exist', async () => {
      mockPrisma.book.findUnique.mockResolvedValue(null);

      await expect(service.createTranslation('no-book', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should auto-create UserBook for an unowned book (anonymous upload)', async () => {
      mockPrisma.book.findUnique.mockResolvedValue({
        id: 'book-1',
        originalFileUrl: 's3://key',
        originalFormat: 'PDF',
        userBooks: [],
        _count: { chapters: 1, userBooks: 0 },
      });
      mockPrisma.translation.findFirst.mockResolvedValue(null);
      mockPrisma.translation.create.mockResolvedValue({
        id: 'tr-1',
        bookId: 'book-1',
        status: 'PAID',
        progress: 0,
      });
      mockPrisma.translation.findUnique.mockResolvedValue({
        id: 'tr-1',
        bookId: 'book-1',
        status: 'PAID',
      });

      await service.createTranslation('book-1', 'user-1');

      expect(mockPrisma.userBook.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', bookId: 'book-1', type: 'UPLOADED' },
      });
    });

    // Regression: book ids are enumerable via the @Public() GET /books, and
    // books.service.verifyOwnership treats any UserBook row as edit/delete
    // rights. Claiming ownership here unconditionally let any logged-in user
    // delete a stranger's book.
    it('should refuse to claim a book that someone else already owns', async () => {
      mockPrisma.book.findUnique.mockResolvedValue({
        id: 'book-1',
        originalFileUrl: 's3://key',
        originalFormat: 'PDF',
        userBooks: [],
        _count: { chapters: 1, userBooks: 1 },
      });

      await expect(service.createTranslation('book-1', 'attacker')).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.userBook.create).not.toHaveBeenCalled();
      expect(mockPrisma.translation.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if translation already exists', async () => {
      mockPrisma.book.findUnique.mockResolvedValue({
        id: 'book-1',
        originalFileUrl: 's3://key',
        originalFormat: 'PDF',
        userBooks: [{ id: 'ub-1' }],
        _count: { chapters: 1 },
      });
      mockPrisma.translation.findFirst.mockResolvedValue({ id: 'existing-tr' });

      await expect(service.createTranslation('book-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should default targetLanguage to Georgian', async () => {
      mockPrisma.book.findUnique.mockResolvedValue({
        id: 'book-1',
        originalFileUrl: 's3://key',
        originalFormat: 'PDF',
        userBooks: [{ id: 'ub-1' }],
        _count: { chapters: 1 },
      });
      mockPrisma.translation.findFirst.mockResolvedValue(null);
      mockPrisma.translation.create.mockResolvedValue({ id: 'tr-1', status: 'PAID' });
      // startTranslation is called in dev mode
      mockPrisma.translation.findUnique.mockResolvedValue({ id: 'tr-1', bookId: 'book-1', status: 'PAID' });

      await service.createTranslation('book-1', 'user-1');

      expect(mockPrisma.translation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ targetLanguage: 'ka' }),
        }),
      );
    });
  });

  describe('parseAndSaveChapters', () => {
    beforeEach(() => {
      mockS3.getPresignedUrl.mockResolvedValue('https://s3.example/presigned');
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      }) as any;
    });

    it('inserts chapters with skipDuplicates so concurrent parses cannot collide', async () => {
      mockParsing.parse.mockResolvedValue({
        totalWordCount: 500,
        chapters: [
          { number: 1, title: 'One', content: 'a', wordCount: 200 },
          { number: 2, title: 'Two', content: 'b', wordCount: 300 },
        ],
      });

      await service.parseAndSaveChapters('book-1', 's3://key', 'PDF');

      expect(mockPrisma.chapter.createMany).toHaveBeenCalledWith({
        data: [
          { bookId: 'book-1', number: 1, title: 'One', originalContent: 'a', wordCount: 200 },
          { bookId: 'book-1', number: 2, title: 'Two', originalContent: 'b', wordCount: 300 },
        ],
        skipDuplicates: true,
      });
      // The old $transaction(map(create)) form aborted wholesale on P2002.
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.chapter.create).not.toHaveBeenCalled();
    });

    it('updates the book page count from the parsed word total', async () => {
      mockParsing.parse.mockResolvedValue({
        totalWordCount: 1000,
        chapters: [{ number: 1, title: 'One', content: 'a', wordCount: 1000 }],
      });

      await service.parseAndSaveChapters('book-1', 's3://key', 'PDF');

      expect(mockPrisma.book.update).toHaveBeenCalledWith({
        where: { id: 'book-1' },
        data: { pageCount: 4 },
      });
    });
  });

  describe('getTranslation', () => {
    it('should return translation with chapters', async () => {
      const mockTranslation = {
        id: 'tr-1',
        bookId: 'book-1',
        status: 'IN_PROGRESS',
        progress: 50,
        book: { id: 'book-1', title: 'Test', author: 'Author', userBooks: [{ userId: 'user-1' }] },
        translatedChapters: [],
      };
      mockPrisma.translation.findUnique.mockResolvedValue(mockTranslation);

      const result = await service.getTranslation('tr-1', 'user-1');
      expect(result.id).toBe('tr-1');
      expect(result.book.title).toBe('Test');
    });

    it('should throw NotFoundException if not found', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue(null);

      await expect(service.getTranslation('no-id', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user does not own the translation', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue({
        id: 'tr-1',
        book: { id: 'book-1', title: 'Test', author: 'A', userBooks: [] },
        translatedChapters: [],
      });

      await expect(service.getTranslation('tr-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getTranslationsByBook', () => {
    it('should return all translations for a book the user owns', async () => {
      mockPrisma.book.findUnique.mockResolvedValue({
        id: 'book-1',
        userBooks: [{ userId: 'user-1' }],
      });
      mockPrisma.translation.findMany.mockResolvedValue([
        { id: 'tr-1' },
        { id: 'tr-2' },
      ]);

      const result = await service.getTranslationsByBook('book-1', 'user-1');
      expect(result).toHaveLength(2);
    });

    it('should throw NotFoundException if book does not exist', async () => {
      mockPrisma.book.findUnique.mockResolvedValue(null);

      await expect(service.getTranslationsByBook('no-book', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user does not own the book', async () => {
      mockPrisma.book.findUnique.mockResolvedValue({
        id: 'book-1',
        userBooks: [],
      });

      await expect(service.getTranslationsByBook('book-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateProgress', () => {
    it('should update progress and status', async () => {
      mockPrisma.translation.update.mockResolvedValue({ id: 'tr-1', progress: 50 });

      await service.updateProgress('tr-1', 50, 'IN_PROGRESS');

      expect(mockPrisma.translation.update).toHaveBeenCalledWith({
        where: { id: 'tr-1' },
        data: expect.objectContaining({ progress: 50, status: 'IN_PROGRESS' }),
      });
    });

    it('should set startedAt when status is IN_PROGRESS and progress is 0', async () => {
      mockPrisma.translation.update.mockResolvedValue({});

      await service.updateProgress('tr-1', 0, 'IN_PROGRESS');

      const callData = mockPrisma.translation.update.mock.calls[0][0].data;
      expect(callData.startedAt).toBeInstanceOf(Date);
    });

    it('should set completedAt when status is COMPLETED', async () => {
      mockPrisma.translation.update.mockResolvedValue({});

      await service.updateProgress('tr-1', 100, 'COMPLETED');

      const callData = mockPrisma.translation.update.mock.calls[0][0].data;
      expect(callData.completedAt).toBeInstanceOf(Date);
    });
  });

  describe('saveTranslatedChapter', () => {
    it('should upsert translated chapter', async () => {
      mockPrisma.translatedChapter.upsert.mockResolvedValue({
        id: 'tc-1',
        translatedContent: 'ქართული ტექსტი',
      });

      await service.saveTranslatedChapter('tr-1', 'ch-1', 'ქართული ტექსტი');

      expect(mockPrisma.translatedChapter.upsert).toHaveBeenCalledWith({
        where: {
          translationId_chapterId: { translationId: 'tr-1', chapterId: 'ch-1' },
        },
        create: { translationId: 'tr-1', chapterId: 'ch-1', translatedContent: 'ქართული ტექსტი' },
        update: { translatedContent: 'ქართული ტექსტი' },
      });
    });
  });

  describe('startTranslation', () => {
    it('should start translation when status is PAID', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue({
        id: 'tr-1',
        bookId: 'book-1',
        status: 'PAID',
      });

      const result = await service.startTranslation('tr-1');
      expect(result.status).toBe('PAID');
    });

    it('should throw NotFoundException if translation not found', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue(null);

      await expect(service.startTranslation('no-id')).rejects.toThrow(NotFoundException);
    });

    it('should not add to queue if status is not PAID', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue({
        id: 'tr-1',
        bookId: 'book-1',
        status: 'PENDING',
      });

      const result = await service.startTranslation('tr-1');
      expect(result.status).toBe('PENDING');
    });
  });

  describe('getMyTranslations', () => {
    it('should return translations for user books', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([
        { id: 'tr-1', book: { title: 'Book 1' } },
      ]);

      const result = await service.getMyTranslations('user-1');
      expect(result).toHaveLength(1);
      expect(mockPrisma.translation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { book: { userBooks: { some: { userId: 'user-1' } } } },
        }),
      );
    });
  });
});
