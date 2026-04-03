import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SynthesizeDto, SynthesizeBookDto } from '../../src/tts/dto/synthesize.dto';

const toDto = <T extends object>(cls: new () => T, obj: Record<string, unknown>): T =>
  plainToInstance(cls, obj);

const expectError = (errors: any[], property: string) => {
  expect(errors.find((e) => e.property === property)).toBeDefined();
};

describe('SynthesizeDto', () => {
  const valid = { bookId: 'book-1', chapterNumber: 1 };

  it('should pass with valid bookId and chapterNumber', async () => {
    const errors = await validate(toDto(SynthesizeDto, valid));
    expect(errors.length).toBe(0);
  });

  it('should fail when bookId is missing', async () => {
    const errors = await validate(toDto(SynthesizeDto, { chapterNumber: 1 }));
    expectError(errors, 'bookId');
  });

  it('should fail when bookId is empty string', async () => {
    const errors = await validate(toDto(SynthesizeDto, { ...valid, bookId: '' }));
    expectError(errors, 'bookId');
  });

  it('should fail when chapterNumber < 1', async () => {
    const errors = await validate(toDto(SynthesizeDto, { ...valid, chapterNumber: 0 }));
    expectError(errors, 'chapterNumber');
  });

  it('should fail when chapterNumber is not integer', async () => {
    const errors = await validate(toDto(SynthesizeDto, { ...valid, chapterNumber: 1.5 }));
    expectError(errors, 'chapterNumber');
  });

  it('should pass with optional voiceId', async () => {
    const errors = await validate(toDto(SynthesizeDto, { ...valid, voiceId: 'voice-1' }));
    expect(errors.length).toBe(0);
  });

  it('should pass with valid speed 1.5', async () => {
    const errors = await validate(toDto(SynthesizeDto, { ...valid, speed: 1.5 }));
    expect(errors.length).toBe(0);
  });

  it('should fail with speed < 0.5', async () => {
    const errors = await validate(toDto(SynthesizeDto, { ...valid, speed: 0.3 }));
    expectError(errors, 'speed');
  });

  it('should fail with speed > 2.0', async () => {
    const errors = await validate(toDto(SynthesizeDto, { ...valid, speed: 2.5 }));
    expectError(errors, 'speed');
  });

  it('should pass with valid provider "elevenlabs"', async () => {
    const errors = await validate(toDto(SynthesizeDto, { ...valid, provider: 'elevenlabs' }));
    expect(errors.length).toBe(0);
  });

  it('should fail with invalid provider "google"', async () => {
    const errors = await validate(toDto(SynthesizeDto, { ...valid, provider: 'google' }));
    expectError(errors, 'provider');
  });
});

describe('SynthesizeBookDto', () => {
  it('should pass with only bookId', async () => {
    const errors = await validate(toDto(SynthesizeBookDto, { bookId: 'book-1' }));
    expect(errors.length).toBe(0);
  });

  it('should pass with all optional fields', async () => {
    const errors = await validate(toDto(SynthesizeBookDto, {
      bookId: 'book-1', voiceId: 'v1', speed: 1.0, provider: 'azure',
    }));
    expect(errors.length).toBe(0);
  });

  it('should fail when bookId is missing', async () => {
    const errors = await validate(toDto(SynthesizeBookDto, {}));
    expectError(errors, 'bookId');
  });

  it('should fail with speed < 0.5', async () => {
    const errors = await validate(toDto(SynthesizeBookDto, { bookId: 'b1', speed: 0.1 }));
    expectError(errors, 'speed');
  });

  it('should fail with speed > 2.0', async () => {
    const errors = await validate(toDto(SynthesizeBookDto, { bookId: 'b1', speed: 3.0 }));
    expectError(errors, 'speed');
  });

  it('should fail with invalid provider', async () => {
    const errors = await validate(toDto(SynthesizeBookDto, { bookId: 'b1', provider: 'openai' }));
    expectError(errors, 'provider');
  });
});

describe('SynthesizeDto voiceId validation', () => {
  it('should pass with valid voiceId (alphanumeric + dash + underscore)', async () => {
    const errors = await validate(toDto(SynthesizeDto, { bookId: 'b1', chapterNumber: 1, voiceId: 'ka-GE-voice_1' }));
    expect(errors.length).toBe(0);
  });

  it('should fail with voiceId containing path traversal', async () => {
    const errors = await validate(toDto(SynthesizeDto, { bookId: 'b1', chapterNumber: 1, voiceId: '../../v2/user' }));
    const err = errors.find((e) => e.property === 'voiceId');
    expect(err).toBeDefined();
  });

  it('should fail with voiceId containing special characters', async () => {
    const errors = await validate(toDto(SynthesizeDto, { bookId: 'b1', chapterNumber: 1, voiceId: 'voice<script>' }));
    const err = errors.find((e) => e.property === 'voiceId');
    expect(err).toBeDefined();
  });
});
