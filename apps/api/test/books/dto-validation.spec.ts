import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateBookDto } from '../../src/books/dto/create-book.dto';
import { UpdateBookDto } from '../../src/books/dto/update-book.dto';
import { SearchBooksDto } from '../../src/books/dto/search-books.dto';
import { PaginationDto } from '../../src/books/dto/pagination.dto';

describe('Books DTOs', () => {
  // ========================
  // CreateBookDto
  // ========================

  describe('CreateBookDto', () => {
    const validData = {
      title: 'Clean Code',
      originalFormat: 'PDF',
    };

    it('should validate with required fields only', async () => {
      const dto = plainToInstance(CreateBookDto, validData);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should validate with all fields', async () => {
      const dto = plainToInstance(CreateBookDto, {
        ...validData,
        author: 'Robert C. Martin',
        description: 'A handbook of agile software craftsmanship',
        isbn: '9780132350884',
        coverUrl: 'https://example.com/cover.jpg',
        language: 'en',
        pageCount: 464,
        googleBooksId: 'gbook-123',
        openLibraryId: '/works/OL123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail when title is missing', async () => {
      const dto = plainToInstance(CreateBookDto, { originalFormat: 'PDF' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'title')).toBe(true);
    });

    it('should fail when originalFormat is missing', async () => {
      const dto = plainToInstance(CreateBookDto, { title: 'Book' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'originalFormat')).toBe(true);
    });

    it('should fail when originalFormat is invalid enum', async () => {
      const dto = plainToInstance(CreateBookDto, { ...validData, originalFormat: 'INVALID' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail when title exceeds 500 characters', async () => {
      const dto = plainToInstance(CreateBookDto, { ...validData, title: 'a'.repeat(501) });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail when author exceeds 200 characters', async () => {
      const dto = plainToInstance(CreateBookDto, { ...validData, author: 'a'.repeat(201) });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail when description exceeds 2000 characters', async () => {
      const dto = plainToInstance(CreateBookDto, { ...validData, description: 'a'.repeat(2001) });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail when pageCount is less than 1', async () => {
      const dto = plainToInstance(CreateBookDto, { ...validData, pageCount: 0 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail when pageCount exceeds 50000', async () => {
      const dto = plainToInstance(CreateBookDto, { ...validData, pageCount: 50001 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept Georgian characters in title', async () => {
      const dto = plainToInstance(CreateBookDto, {
        ...validData,
        title: 'ქართული წიგნის სათაური',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept Georgian characters in author', async () => {
      const dto = plainToInstance(CreateBookDto, {
        ...validData,
        author: 'გიორგი მერჩულე',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail when title is empty string', async () => {
      const dto = plainToInstance(CreateBookDto, { ...validData, title: '' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail when coverUrl is not a valid URL', async () => {
      const dto = plainToInstance(CreateBookDto, { ...validData, coverUrl: 'not-a-url' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept valid coverUrl', async () => {
      const dto = plainToInstance(CreateBookDto, {
        ...validData,
        coverUrl: 'https://example.com/cover.jpg',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  // ========================
  // UpdateBookDto
  // ========================

  describe('UpdateBookDto', () => {
    it('should validate with empty object (all optional)', async () => {
      const dto = plainToInstance(UpdateBookDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should validate with partial fields', async () => {
      const dto = plainToInstance(UpdateBookDto, { title: 'Updated Title' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail when title exceeds 500 characters', async () => {
      const dto = plainToInstance(UpdateBookDto, { title: 'a'.repeat(501) });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail when pageCount is not an integer', async () => {
      const dto = plainToInstance(UpdateBookDto, { pageCount: 10.5 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ========================
  // SearchBooksDto
  // ========================

  describe('SearchBooksDto', () => {
    it('should validate with query string', async () => {
      const dto = plainToInstance(SearchBooksDto, { q: 'clean code' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should validate with query and limit', async () => {
      const dto = plainToInstance(SearchBooksDto, { q: 'test', limit: 20 });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail when query is missing', async () => {
      const dto = plainToInstance(SearchBooksDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'q')).toBe(true);
    });

    it('should fail when query exceeds 200 characters', async () => {
      const dto = plainToInstance(SearchBooksDto, { q: 'a'.repeat(201) });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail when limit exceeds 40', async () => {
      const dto = plainToInstance(SearchBooksDto, { q: 'test', limit: 41 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail when limit is less than 1', async () => {
      const dto = plainToInstance(SearchBooksDto, { q: 'test', limit: 0 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept Georgian query text', async () => {
      const dto = plainToInstance(SearchBooksDto, { q: 'ვეფხისტყაოსანი' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  // ========================
  // PaginationDto
  // ========================

  describe('PaginationDto', () => {
    it('should validate with empty object (all defaults)', async () => {
      const dto = plainToInstance(PaginationDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should validate with all fields', async () => {
      const dto = plainToInstance(PaginationDto, {
        page: 2,
        limit: 50,
        sortBy: 'title',
        order: 'asc',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail when page is less than 1', async () => {
      const dto = plainToInstance(PaginationDto, { page: 0 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail when limit exceeds 100', async () => {
      const dto = plainToInstance(PaginationDto, { limit: 101 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail when order is invalid', async () => {
      const dto = plainToInstance(PaginationDto, { order: 'random' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept "asc" order', async () => {
      const dto = plainToInstance(PaginationDto, { order: 'asc' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept "desc" order', async () => {
      const dto = plainToInstance(PaginationDto, { order: 'desc' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail when sortBy is not in allowlist', async () => {
      const dto = plainToInstance(PaginationDto, { sortBy: 'password' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept valid sortBy values', async () => {
      for (const field of ['createdAt', 'title', 'author', 'pageCount', 'updatedAt']) {
        const dto = plainToInstance(PaginationDto, { sortBy: field });
        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      }
    });
  });
});
