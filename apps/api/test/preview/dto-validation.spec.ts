import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreatePreviewDto } from '../../src/preview/dto/create-preview.dto';

describe('CreatePreviewDto', () => {
  const toDto = (obj: Record<string, unknown>) => plainToInstance(CreatePreviewDto, obj);
  const errorOn = async (obj: Record<string, unknown>, property: string) =>
    (await validate(toDto(obj))).find((e) => e.property === property);

  describe('bookId', () => {
    it('passes with a valid bookId', async () => {
      expect(await validate(toDto({ bookId: 'clxyz123abc' }))).toHaveLength(0);
    });

    it.each([
      ['missing', {}],
      ['empty', { bookId: '' }],
      ['not a string', { bookId: 12345 }],
    ])('fails when bookId is %s', async (_label, obj) => {
      expect(await errorOn(obj, 'bookId')).toBeDefined();
    });
  });

  describe('targetLanguage', () => {
    it('defaults to "ka" when omitted', () => {
      expect(toDto({ bookId: 'b1' }).targetLanguage).toBe('ka');
    });

    it('accepts "ka"', async () => {
      expect(await errorOn({ bookId: 'b1', targetLanguage: 'ka' }, 'targetLanguage')).toBeUndefined();
    });

    // The translator prompt is English→Georgian only; anything else would
    // silently produce Georgian output under a wrong label.
    it.each(['en', 'ru', 'de', ''])('rejects "%s"', async (lang) => {
      expect(await errorOn({ bookId: 'b1', targetLanguage: lang }, 'targetLanguage')).toBeDefined();
    });
  });
});
