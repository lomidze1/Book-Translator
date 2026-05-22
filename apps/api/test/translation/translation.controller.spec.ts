import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranslationController } from '../../src/translation/translation.controller';

describe('TranslationController', () => {
  let controller: TranslationController;

  const mockTranslationService = {
    createTranslation: vi.fn(),
    getTranslation: vi.fn(),
    getTranslationsByBook: vi.fn(),
    getMyTranslations: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new (TranslationController as any)(mockTranslationService);
  });

  describe('POST /translations', () => {
    it('should create a translation', async () => {
      const dto = { bookId: 'book-1', targetLanguage: 'ka' };
      const expected = { id: 'tr-1', bookId: 'book-1', status: 'PENDING' };
      mockTranslationService.createTranslation.mockResolvedValue(expected);

      const result = await controller.create(dto, 'user-1');

      expect(result).toEqual(expected);
      expect(mockTranslationService.createTranslation).toHaveBeenCalledWith('book-1', 'user-1', 'ka', undefined);
    });

    it('should propagate service errors', async () => {
      mockTranslationService.createTranslation.mockRejectedValue(new Error('Book not found'));

      await expect(controller.create({ bookId: 'none' }, 'user-1')).rejects.toThrow('Book not found');
    });
  });

  describe('GET /translations/:id', () => {
    it('should return translation by id with ownership check', async () => {
      const expected = { id: 'tr-1', status: 'COMPLETED', progress: 100 };
      mockTranslationService.getTranslation.mockResolvedValue(expected);

      const result = await controller.getTranslation('tr-1', 'user-1');

      expect(result).toEqual(expected);
      expect(mockTranslationService.getTranslation).toHaveBeenCalledWith('tr-1', 'user-1');
    });
  });

  describe('GET /translations/my', () => {
    it('should return user translations', async () => {
      const expected = [{ id: 'tr-1' }, { id: 'tr-2' }];
      mockTranslationService.getMyTranslations.mockResolvedValue(expected);

      const result = await controller.getMyTranslations('user-1', 1, 50);

      expect(result).toEqual(expected);
      expect(mockTranslationService.getMyTranslations).toHaveBeenCalledWith('user-1', 1, 50);
    });
  });

  describe('GET /translations/book/:bookId', () => {
    it('should return translations for a book with ownership check', async () => {
      const expected = [{ id: 'tr-1' }];
      mockTranslationService.getTranslationsByBook.mockResolvedValue(expected);

      const result = await controller.getByBook('book-1', 'user-1', 1, 50);

      expect(result).toEqual(expected);
      expect(mockTranslationService.getTranslationsByBook).toHaveBeenCalledWith('book-1', 'user-1', 1, 50);
    });
  });
});
