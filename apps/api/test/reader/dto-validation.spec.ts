import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  SaveProgressDto,
  CreateBookmarkDto,
  CreateHighlightDto,
  CreateNoteDto,
  UpdateHighlightDto,
  UpdateNoteDto,
} from '../../src/reader/dto';

// ========================
// Helper
// ========================

const toDto = <T extends object>(cls: new () => T, obj: Record<string, unknown>): T =>
  plainToInstance(cls, obj);

const expectError = (errors: any[], property: string) => {
  const err = errors.find((e) => e.property === property);
  expect(err).toBeDefined();
};

const expectNoErrors = (errors: any[]) => {
  expect(errors.length).toBe(0);
};

// ========================
// SaveProgressDto
// ========================

describe('SaveProgressDto', () => {
  const validData = {
    bookId: 'clxyz123abc',
    currentChapter: 3,
    currentPosition: 1500,
    percentage: 45.5,
  };

  it('should pass with all valid fields', async () => {
    const dto = toDto(SaveProgressDto, validData);
    const errors = await validate(dto);
    expectNoErrors(errors);
  });

  it('should fail when bookId is missing', async () => {
    const dto = toDto(SaveProgressDto, { ...validData, bookId: undefined });
    const errors = await validate(dto);
    expectError(errors, 'bookId');
  });

  it('should fail when bookId is empty string', async () => {
    const dto = toDto(SaveProgressDto, { ...validData, bookId: '' });
    const errors = await validate(dto);
    expectError(errors, 'bookId');
  });

  it('should fail when currentChapter is not integer', async () => {
    const dto = toDto(SaveProgressDto, { ...validData, currentChapter: 2.5 });
    const errors = await validate(dto);
    expectError(errors, 'currentChapter');
  });

  it('should fail when currentChapter < 1', async () => {
    const dto = toDto(SaveProgressDto, { ...validData, currentChapter: 0 });
    const errors = await validate(dto);
    expectError(errors, 'currentChapter');
  });

  it('should fail when currentPosition is negative', async () => {
    const dto = toDto(SaveProgressDto, { ...validData, currentPosition: -1 });
    const errors = await validate(dto);
    expectError(errors, 'currentPosition');
  });

  it('should pass when currentPosition is 0', async () => {
    const dto = toDto(SaveProgressDto, { ...validData, currentPosition: 0 });
    const errors = await validate(dto);
    expectNoErrors(errors);
  });

  it('should fail when percentage is not a number', async () => {
    const dto = toDto(SaveProgressDto, { ...validData, percentage: 'fifty' });
    const errors = await validate(dto);
    expectError(errors, 'percentage');
  });

  it('should fail when percentage < 0', async () => {
    const dto = toDto(SaveProgressDto, { ...validData, percentage: -1 });
    const errors = await validate(dto);
    expectError(errors, 'percentage');
  });

  it('should fail when percentage > 100', async () => {
    const dto = toDto(SaveProgressDto, { ...validData, percentage: 101 });
    const errors = await validate(dto);
    expectError(errors, 'percentage');
  });

  it('should pass with percentage = 0 (start of book)', async () => {
    const dto = toDto(SaveProgressDto, { ...validData, percentage: 0 });
    const errors = await validate(dto);
    expectNoErrors(errors);
  });

  it('should pass with percentage = 100 (end of book)', async () => {
    const dto = toDto(SaveProgressDto, { ...validData, percentage: 100 });
    const errors = await validate(dto);
    expectNoErrors(errors);
  });
});

// ========================
// CreateBookmarkDto
// ========================

describe('CreateBookmarkDto', () => {
  const validData = {
    bookId: 'book-1',
    chapterNumber: 1,
    position: 500,
  };

  it('should pass with all required fields', async () => {
    const dto = toDto(CreateBookmarkDto, validData);
    const errors = await validate(dto);
    expectNoErrors(errors);
  });

  it('should pass with optional label', async () => {
    const dto = toDto(CreateBookmarkDto, { ...validData, label: 'თავი 1 — შესავალი' });
    const errors = await validate(dto);
    expectNoErrors(errors);
  });

  it('should pass without optional label', async () => {
    const dto = toDto(CreateBookmarkDto, validData);
    const errors = await validate(dto);
    expectNoErrors(errors);
  });

  it('should fail when bookId is missing', async () => {
    const dto = toDto(CreateBookmarkDto, { chapterNumber: 1, position: 0 });
    const errors = await validate(dto);
    expectError(errors, 'bookId');
  });

  it('should fail when chapterNumber < 1', async () => {
    const dto = toDto(CreateBookmarkDto, { ...validData, chapterNumber: 0 });
    const errors = await validate(dto);
    expectError(errors, 'chapterNumber');
  });

  it('should fail when position is negative', async () => {
    const dto = toDto(CreateBookmarkDto, { ...validData, position: -10 });
    const errors = await validate(dto);
    expectError(errors, 'position');
  });

  it('should fail when label exceeds 200 characters', async () => {
    const dto = toDto(CreateBookmarkDto, { ...validData, label: 'ა'.repeat(201) });
    const errors = await validate(dto);
    expectError(errors, 'label');
  });
});

// ========================
// CreateHighlightDto
// ========================

describe('CreateHighlightDto', () => {
  const validData = {
    bookId: 'book-1',
    chapterNumber: 2,
    startPosition: 100,
    endPosition: 200,
    selectedText: 'ეს არის მონიშნული ტექსტი',
  };

  it('should pass with valid fields and default color', async () => {
    const dto = toDto(CreateHighlightDto, validData);
    const errors = await validate(dto);
    expectNoErrors(errors);
  });

  it('should pass with valid color "green"', async () => {
    const dto = toDto(CreateHighlightDto, { ...validData, color: 'green' });
    const errors = await validate(dto);
    expectNoErrors(errors);
  });

  it('should pass with valid color "blue"', async () => {
    const dto = toDto(CreateHighlightDto, { ...validData, color: 'blue' });
    const errors = await validate(dto);
    expectNoErrors(errors);
  });

  it('should pass with valid color "red"', async () => {
    const dto = toDto(CreateHighlightDto, { ...validData, color: 'red' });
    const errors = await validate(dto);
    expectNoErrors(errors);
  });

  it('should fail with invalid color "purple"', async () => {
    const dto = toDto(CreateHighlightDto, { ...validData, color: 'purple' });
    const errors = await validate(dto);
    expectError(errors, 'color');
  });

  it('should fail when selectedText is empty', async () => {
    const dto = toDto(CreateHighlightDto, { ...validData, selectedText: '' });
    const errors = await validate(dto);
    expectError(errors, 'selectedText');
  });

  it('should fail when selectedText exceeds 5000 characters', async () => {
    const dto = toDto(CreateHighlightDto, { ...validData, selectedText: 'ა'.repeat(5001) });
    const errors = await validate(dto);
    expectError(errors, 'selectedText');
  });

  it('should fail when startPosition is negative', async () => {
    const dto = toDto(CreateHighlightDto, { ...validData, startPosition: -1 });
    const errors = await validate(dto);
    expectError(errors, 'startPosition');
  });

  it('should fail when endPosition < 1', async () => {
    const dto = toDto(CreateHighlightDto, { ...validData, endPosition: 0 });
    const errors = await validate(dto);
    expectError(errors, 'endPosition');
  });

  it('should fail when bookId is missing', async () => {
    const { bookId, ...rest } = validData;
    const dto = toDto(CreateHighlightDto, rest);
    const errors = await validate(dto);
    expectError(errors, 'bookId');
  });
});

// ========================
// CreateNoteDto
// ========================

describe('CreateNoteDto', () => {
  const validData = {
    bookId: 'book-1',
    chapterNumber: 1,
    content: 'ეს არის ჩემი შენიშვნა',
  };

  it('should pass with all required fields', async () => {
    const dto = toDto(CreateNoteDto, validData);
    const errors = await validate(dto);
    expectNoErrors(errors);
  });

  it('should pass with optional highlightId', async () => {
    const dto = toDto(CreateNoteDto, { ...validData, highlightId: 'highlight-1' });
    const errors = await validate(dto);
    expectNoErrors(errors);
  });

  it('should pass without highlightId', async () => {
    const dto = toDto(CreateNoteDto, validData);
    const errors = await validate(dto);
    expectNoErrors(errors);
  });

  it('should fail when content is empty', async () => {
    const dto = toDto(CreateNoteDto, { ...validData, content: '' });
    const errors = await validate(dto);
    expectError(errors, 'content');
  });

  it('should fail when content exceeds 10000 characters', async () => {
    const dto = toDto(CreateNoteDto, { ...validData, content: 'ტ'.repeat(10001) });
    const errors = await validate(dto);
    expectError(errors, 'content');
  });

  it('should fail when bookId is missing', async () => {
    const dto = toDto(CreateNoteDto, { chapterNumber: 1, content: 'note' });
    const errors = await validate(dto);
    expectError(errors, 'bookId');
  });

  it('should fail when chapterNumber < 1', async () => {
    const dto = toDto(CreateNoteDto, { ...validData, chapterNumber: 0 });
    const errors = await validate(dto);
    expectError(errors, 'chapterNumber');
  });
});

// ========================
// UpdateHighlightDto
// ========================

describe('UpdateHighlightDto', () => {
  it('should pass with valid color "yellow"', async () => {
    const dto = toDto(UpdateHighlightDto, { color: 'yellow' });
    const errors = await validate(dto);
    expectNoErrors(errors);
  });

  it('should pass with valid color "red"', async () => {
    const dto = toDto(UpdateHighlightDto, { color: 'red' });
    const errors = await validate(dto);
    expectNoErrors(errors);
  });

  it('should fail with invalid color "orange"', async () => {
    const dto = toDto(UpdateHighlightDto, { color: 'orange' });
    const errors = await validate(dto);
    expectError(errors, 'color');
  });

  it('should fail when color is missing', async () => {
    const dto = toDto(UpdateHighlightDto, {});
    const errors = await validate(dto);
    expectError(errors, 'color');
  });
});

// ========================
// UpdateNoteDto
// ========================

describe('UpdateNoteDto', () => {
  it('should pass with valid content', async () => {
    const dto = toDto(UpdateNoteDto, { content: 'განახლებული შენიშვნა' });
    const errors = await validate(dto);
    expectNoErrors(errors);
  });

  it('should fail when content is empty', async () => {
    const dto = toDto(UpdateNoteDto, { content: '' });
    const errors = await validate(dto);
    expectError(errors, 'content');
  });

  it('should fail when content exceeds 10000 characters', async () => {
    const dto = toDto(UpdateNoteDto, { content: 'x'.repeat(10001) });
    const errors = await validate(dto);
    expectError(errors, 'content');
  });

  it('should fail when content is missing', async () => {
    const dto = toDto(UpdateNoteDto, {});
    const errors = await validate(dto);
    expectError(errors, 'content');
  });
});
