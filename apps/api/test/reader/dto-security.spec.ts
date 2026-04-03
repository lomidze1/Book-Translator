import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateBookmarkDto,
  CreateHighlightDto,
  CreateNoteDto,
  SaveProgressDto,
} from '../../src/reader/dto';

const toDto = <T extends object>(cls: new () => T, obj: Record<string, unknown>): T =>
  plainToInstance(cls, obj);

const expectError = (errors: any[], property: string) => {
  const err = errors.find((e) => e.property === property);
  expect(err).toBeDefined();
};

// ========================
// SQL Injection Prevention
// ========================

describe('SQL Injection Prevention', () => {
  it('should reject SQL injection in bookmark label', async () => {
    const dto = toDto(CreateBookmarkDto, {
      bookId: 'book-1',
      chapterNumber: 1,
      position: 0,
      label: "'; DROP TABLE bookmarks; --",
    });
    const errors = await validate(dto);
    expectError(errors, 'label');
  });

  it('should reject SQL injection with UNION SELECT in label', async () => {
    const dto = toDto(CreateBookmarkDto, {
      bookId: 'book-1',
      chapterNumber: 1,
      position: 0,
      label: "' UNION SELECT * FROM users --",
    });
    const errors = await validate(dto);
    expectError(errors, 'label');
  });
});

// ========================
// XSS Prevention
// ========================

describe('XSS Prevention', () => {
  it('should reject XSS in bookmark label', async () => {
    const dto = toDto(CreateBookmarkDto, {
      bookId: 'book-1',
      chapterNumber: 1,
      position: 0,
      label: '<script>alert("XSS")</script>',
    });
    const errors = await validate(dto);
    expectError(errors, 'label');
  });

  it('should reject XSS with img onerror in bookmark label', async () => {
    const dto = toDto(CreateBookmarkDto, {
      bookId: 'book-1',
      chapterNumber: 1,
      position: 0,
      label: '<img src=x onerror=alert("XSS")>',
    });
    const errors = await validate(dto);
    expectError(errors, 'label');
  });

  it('should accept Georgian text in bookmark label', async () => {
    const dto = toDto(CreateBookmarkDto, {
      bookId: 'book-1',
      chapterNumber: 1,
      position: 0,
      label: 'თავი 1: შესავალი',
    });
    const errors = await validate(dto);
    const labelError = errors.find((e) => e.property === 'label');
    expect(labelError).toBeUndefined();
  });
});

// ========================
// Type Coercion
// ========================

describe('Type Coercion', () => {
  it('should reject string as currentChapter', async () => {
    const dto = toDto(SaveProgressDto, {
      bookId: 'book-1',
      currentChapter: 'three',
      currentPosition: 0,
      percentage: 50,
    });
    const errors = await validate(dto);
    expectError(errors, 'currentChapter');
  });

  it('should reject string as percentage', async () => {
    const dto = toDto(SaveProgressDto, {
      bookId: 'book-1',
      currentChapter: 1,
      currentPosition: 0,
      percentage: 'fifty',
    });
    const errors = await validate(dto);
    expectError(errors, 'percentage');
  });

  it('should reject boolean as bookId', async () => {
    const dto = toDto(SaveProgressDto, {
      bookId: true,
      currentChapter: 1,
      currentPosition: 0,
      percentage: 50,
    });
    const errors = await validate(dto);
    expectError(errors, 'bookId');
  });
});

// ========================
// Boundary Values
// ========================

describe('Boundary Values', () => {
  it('should accept highlight with exactly 5000 char selectedText', async () => {
    const dto = toDto(CreateHighlightDto, {
      bookId: 'book-1',
      chapterNumber: 1,
      startPosition: 0,
      endPosition: 5000,
      selectedText: 'ა'.repeat(5000),
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept note with exactly 10000 char content', async () => {
    const dto = toDto(CreateNoteDto, {
      bookId: 'book-1',
      chapterNumber: 1,
      content: 'ტ'.repeat(10000),
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept bookmark label with exactly 200 characters', async () => {
    const dto = toDto(CreateBookmarkDto, {
      bookId: 'book-1',
      chapterNumber: 1,
      position: 0,
      label: 'ა'.repeat(200),
    });
    const errors = await validate(dto);
    const labelError = errors.find((e) => e.property === 'label');
    expect(labelError).toBeUndefined();
  });

  it('should reject percentage of exactly 100.01', async () => {
    const dto = toDto(SaveProgressDto, {
      bookId: 'book-1',
      currentChapter: 1,
      currentPosition: 0,
      percentage: 100.01,
    });
    const errors = await validate(dto);
    expectError(errors, 'percentage');
  });
});
