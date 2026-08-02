import { describe, it, expect } from 'vitest';
import { slicePreviewText } from '../../src/preview/preview.slice';
import {
  PREVIEW_MAX_CHARS,
  PREVIEW_WORD_COUNT,
  PREVIEW_MIN_RATIO,
} from '../../src/preview/preview.constants';

/**
 * Build `count` words of prose with a sentence boundary every `perSentence`.
 * Tokens are kept short (~5.5 chars incl. the space, matching real English
 * prose) so 1000 words lands well inside PREVIEW_MAX_CHARS and the WORD target
 * is what binds — the character ceiling has its own tests below.
 */
function prose(count: number, perSentence = 12): string {
  const stems = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'cras', 'nunc', 'vel'];
  const words: string[] = [];
  for (let i = 0; i < count; i++) {
    const last = (i + 1) % perSentence === 0;
    words.push(`${stems[i % stems.length]}${last ? '.' : ''}`);
  }
  return words.join(' ');
}

const wordsIn = (text: string) => (text.match(/\S+/g) || []).length;

describe('slicePreviewText', () => {
  describe('short input', () => {
    it('returns the whole chapter when it fits the budget', () => {
      const content = prose(400);
      const result = slicePreviewText(content, PREVIEW_WORD_COUNT);

      expect(result.text).toBe(content);
      expect(result.truncated).toBe(false);
      expect(result.wordCount).toBe(400);
    });

    it('returns the whole chapter when only slightly over target (no orphan tail)', () => {
      // 1150 words is within the 1.2x whole-chapter ratio of 1000.
      const content = prose(1150);
      const result = slicePreviewText(content, PREVIEW_WORD_COUNT);

      expect(result.truncated).toBe(false);
      expect(result.wordCount).toBe(1150);
    });

    it('handles empty and whitespace-only input without throwing', () => {
      expect(slicePreviewText('', PREVIEW_WORD_COUNT)).toEqual({
        text: '',
        wordCount: 0,
        truncated: false,
      });
      expect(slicePreviewText('   \n\n  ', PREVIEW_WORD_COUNT)).toEqual({
        text: '',
        wordCount: 0,
        truncated: false,
      });
    });
  });

  describe('truncation', () => {
    it('cuts near the target and ends on a sentence terminator', () => {
      const result = slicePreviewText(prose(5000), PREVIEW_WORD_COUNT);

      expect(result.truncated).toBe(true);
      expect(result.wordCount).toBeGreaterThanOrEqual(PREVIEW_WORD_COUNT);
      expect(result.wordCount).toBeLessThanOrEqual(PREVIEW_WORD_COUNT + 60);
      expect(result.text).toMatch(/[.!?…]$/);
    });

    it('never cuts mid-word', () => {
      const source = prose(5000);
      const result = slicePreviewText(source, PREVIEW_WORD_COUNT);

      // The slice must be a verbatim prefix of the source. A mid-word cut would
      // break this, since the next source character would continue the word.
      expect(source.startsWith(result.text)).toBe(true);
      expect(source[result.text.length]).toMatch(/\s/);
    });

    it('preserves paragraph breaks', () => {
      const paragraphs = Array.from({ length: 40 }, () => prose(100)).join('\n\n');
      const result = slicePreviewText(paragraphs, PREVIEW_WORD_COUNT);

      expect(result.text).toContain('\n\n');
    });

    it('includes a closing quote that follows the terminator', () => {
      // Words 1..1000 are unpunctuated, so the cut lands at word 1000 and the
      // first sentence end after it is the quoted one at word 1004.
      const content = [
        'alpha '.repeat(1000).trim(),
        'beta gamma "Ends here."',
        'delta '.repeat(3000).trim(),
      ].join(' ');
      const result = slicePreviewText(content, PREVIEW_WORD_COUNT);

      // The quote must come along, not be orphaned onto the discarded remainder.
      expect(result.text.endsWith('"Ends here."')).toBe(true);
    });
  });

  describe('fallbacks', () => {
    it('falls back to the previous sentence when none is within the overshoot', () => {
      // One sentence end at word 800, then 4000 unpunctuated words.
      const content = `${prose(800, 800)} ${'filler '.repeat(4000).trim()}`;
      const result = slicePreviewText(content, PREVIEW_WORD_COUNT);

      expect(result.truncated).toBe(true);
      expect(result.text).toMatch(/[.!?…]$/);
      expect(result.wordCount).toBeGreaterThanOrEqual(PREVIEW_WORD_COUNT * PREVIEW_MIN_RATIO);
    });

    it('never falls back below the minimum ratio', () => {
      // Only sentence end is at word 100 — far below the 750-word floor.
      const content = `${prose(100, 100)} ${'filler '.repeat(5000).trim()}`;
      const result = slicePreviewText(content, PREVIEW_WORD_COUNT);

      expect(result.wordCount).toBeGreaterThanOrEqual(PREVIEW_WORD_COUNT * PREVIEW_MIN_RATIO);
    });

    it('cuts on a word boundary with an ellipsis when there is no punctuation at all', () => {
      const content = 'filler '.repeat(5000).trim();
      const result = slicePreviewText(content, PREVIEW_WORD_COUNT);

      expect(result.truncated).toBe(true);
      expect(result.text.endsWith('…')).toBe(true);
      expect(result.text).not.toMatch(/fille…$/);
    });
  });

  describe('hard character ceiling', () => {
    it('never exceeds PREVIEW_MAX_CHARS', () => {
      // Long words: 1000 of them blows past 7500 chars well before the word target.
      const content = Array.from({ length: 3000 }, (_, i) => `${'x'.repeat(40)}${i}.`).join(' ');
      const result = slicePreviewText(content, PREVIEW_WORD_COUNT);

      expect(result.text.length).toBeLessThanOrEqual(PREVIEW_MAX_CHARS);
      expect(result.truncated).toBe(true);
    });

    it('applies the ceiling to whole-chapter results too', () => {
      const content = Array.from({ length: 500 }, () => 'y'.repeat(60)).join(' ');
      const result = slicePreviewText(content, PREVIEW_WORD_COUNT);

      expect(result.text.length).toBeLessThanOrEqual(PREVIEW_MAX_CHARS);
    });

    it('reports a word count matching the returned text after clamping', () => {
      const content = Array.from({ length: 3000 }, (_, i) => `${'x'.repeat(40)}${i}.`).join(' ');
      const result = slicePreviewText(content, PREVIEW_WORD_COUNT);

      expect(result.wordCount).toBe(wordsIn(result.text));
    });
  });

  describe('unicode', () => {
    it('does not corrupt Georgian text', () => {
      const georgian = Array.from({ length: 3000 }, (_, i) => `სიტყვა${i}${i % 10 === 9 ? '.' : ''}`).join(' ');
      const result = slicePreviewText(georgian, PREVIEW_WORD_COUNT);

      expect(result.text).not.toContain('�');
      expect(georgian.startsWith(result.text.replace(/…$/, ''))).toBe(true);
    });
  });
});
