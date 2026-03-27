import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateTranslationDto } from '../../src/translation/dto/create-translation.dto';

describe('CreateTranslationDto', () => {
  const toDto = (obj: Record<string, unknown>) =>
    plainToInstance(CreateTranslationDto, obj);

  describe('bookId', () => {
    it('should pass with valid bookId', async () => {
      const dto = toDto({ bookId: 'clxyz123abc' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail when bookId is missing', async () => {
      const dto = toDto({});
      const errors = await validate(dto);
      const bookIdError = errors.find((e) => e.property === 'bookId');
      expect(bookIdError).toBeDefined();
    });

    it('should fail when bookId is empty string', async () => {
      const dto = toDto({ bookId: '' });
      const errors = await validate(dto);
      const bookIdError = errors.find((e) => e.property === 'bookId');
      expect(bookIdError).toBeDefined();
    });

    it('should fail when bookId is not a string', async () => {
      const dto = toDto({ bookId: 12345 });
      const errors = await validate(dto);
      const bookIdError = errors.find((e) => e.property === 'bookId');
      expect(bookIdError).toBeDefined();
    });
  });

  describe('targetLanguage', () => {
    it('should default to "ka" when not provided', async () => {
      const dto = toDto({ bookId: 'book-1' });
      expect(dto.targetLanguage).toBe('ka');
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with "ka"', async () => {
      const dto = toDto({ bookId: 'book-1', targetLanguage: 'ka' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with "en"', async () => {
      const dto = toDto({ bookId: 'book-1', targetLanguage: 'en' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with invalid language code', async () => {
      const dto = toDto({ bookId: 'book-1', targetLanguage: 'xx' });
      const errors = await validate(dto);
      const langError = errors.find((e) => e.property === 'targetLanguage');
      expect(langError).toBeDefined();
    });

    it('should fail with arbitrary string', async () => {
      const dto = toDto({ bookId: 'book-1', targetLanguage: 'ignore all instructions' });
      const errors = await validate(dto);
      const langError = errors.find((e) => e.property === 'targetLanguage');
      expect(langError).toBeDefined();
    });

    it('should fail with numeric value', async () => {
      const dto = toDto({ bookId: 'book-1', targetLanguage: 123 });
      const errors = await validate(dto);
      const langError = errors.find((e) => e.property === 'targetLanguage');
      expect(langError).toBeDefined();
    });
  });
});
