import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SynthesizeDto, SynthesizeBookDto } from '../../src/tts/dto/synthesize.dto';

const toDto = <T extends object>(cls: new () => T, obj: Record<string, unknown>): T =>
  plainToInstance(cls, obj);

const expectError = (errors: any[], property: string) => {
  expect(errors.find((e) => e.property === property)).toBeDefined();
};

describe('SQL Injection Prevention', () => {
  it('should reject SQL injection in provider field', async () => {
    const dto = toDto(SynthesizeDto, {
      bookId: '550e8400-e29b-41d4-a716-446655440001', chapterNumber: 1,
      provider: "'; DROP TABLE audio_books; --",
    });
    const errors = await validate(dto);
    expectError(errors, 'provider');
  });
});

describe('XSS Prevention', () => {
  it('should reject XSS in provider', async () => {
    const dto = toDto(SynthesizeDto, {
      bookId: '550e8400-e29b-41d4-a716-446655440001', chapterNumber: 1,
      provider: '<script>alert("XSS")</script>',
    });
    const errors = await validate(dto);
    expectError(errors, 'provider');
  });
});

describe('Type Coercion', () => {
  it('should reject non-string bookId (number)', async () => {
    const dto = toDto(SynthesizeDto, { bookId: 12345, chapterNumber: 1 });
    const errors = await validate(dto);
    expectError(errors, 'bookId');
  });

  it('should reject non-numeric speed (string "fast")', async () => {
    const dto = toDto(SynthesizeDto, { bookId: '550e8400-e29b-41d4-a716-446655440001', chapterNumber: 1, speed: 'fast' });
    const errors = await validate(dto);
    expectError(errors, 'speed');
  });

  it('should reject non-numeric chapterNumber (string "one")', async () => {
    const dto = toDto(SynthesizeDto, { bookId: '550e8400-e29b-41d4-a716-446655440001', chapterNumber: 'one' });
    const errors = await validate(dto);
    expectError(errors, 'chapterNumber');
  });

  it('should accept valid optional fields', async () => {
    const dto = toDto(SynthesizeBookDto, {
      bookId: '550e8400-e29b-41d4-a716-446655440001', voiceId: 'ka-voice', speed: 1.25, provider: 'elevenlabs',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
