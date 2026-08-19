import { describe, it, expect } from 'vitest';
import {
  resolveHighlightRanges,
  segmentChapterText,
  selectionToChapterRange,
  type HighlightAnchor,
  type HighlightRange,
} from '../src/utils/highlight-text';

const CHAPTER = 'ბაბუამ ლამპარი აანთო.\n\nელოუენი კარს მიადგა და გაჩერდა.';

function anchor(over: Partial<HighlightAnchor> = {}): HighlightAnchor {
  const start = over.startPosition ?? 0;
  const end = over.endPosition ?? 6;
  return {
    id: over.id ?? 'h1',
    startPosition: start,
    endPosition: end,
    selectedText: over.selectedText ?? CHAPTER.slice(start, end),
    color: over.color ?? 'yellow',
    ...over,
  };
}

const joined = (text: string, ranges: HighlightRange[]) =>
  segmentChapterText(text, ranges)
    .map((s) => s.text)
    .join('');

// Small deterministic PRNG so the "arbitrary range sets" cases are stable.
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe('resolveHighlightRanges — legacy and drifted anchors', () => {
  it('re-anchors legacy highlights stored without positions (0/0) via the quote', () => {
    // Old rows predate position tracking: both offsets are 0 but the quote is real.
    const legacy = anchor({ startPosition: 0, endPosition: 0, selectedText: 'კარს' });
    expect(resolveHighlightRanges(CHAPTER, [legacy])).toEqual([
      { id: 'h1', start: CHAPTER.indexOf('კარს'), end: CHAPTER.indexOf('კარს') + 4, color: 'yellow' },
    ]);
  });

  it('falls back to the FIRST occurrence when the quote appears more than once', () => {
    const text = 'და კიდევ და კიდევ და';
    const drifted = anchor({ startPosition: 500, endPosition: 502, selectedText: 'და' });
    expect(resolveHighlightRanges(text, [drifted])).toEqual([
      { id: 'h1', start: 0, end: 2, color: 'yellow' },
    ]);
  });

  it('keeps a later duplicate occurrence when the stored positions still match it', () => {
    const text = 'და კიდევ და კიდევ';
    // Second "და" starts at 9 — positions agree with the quote, so no fallback.
    const exact = anchor({ startPosition: 9, endPosition: 11, selectedText: 'და' });
    expect(resolveHighlightRanges(text, [exact])).toEqual([
      { id: 'h1', start: 9, end: 11, color: 'yellow' },
    ]);
  });

  it('re-anchors inverted stored positions (end < start) through the quote', () => {
    const inverted = anchor({ startPosition: 14, endPosition: 7, selectedText: 'ლამპარი' });
    expect(resolveHighlightRanges(CHAPTER, [inverted])).toEqual([
      { id: 'h1', start: 7, end: 14, color: 'yellow' },
    ]);
  });

  it('re-anchors negative stored positions through the quote', () => {
    const negative = anchor({ startPosition: -20, endPosition: -13, selectedText: 'ლამპარი' });
    expect(resolveHighlightRanges(CHAPTER, [negative])).toEqual([
      { id: 'h1', start: 7, end: 14, color: 'yellow' },
    ]);
  });

  it('resolves a quote sitting at the very end of the chapter', () => {
    const tail = 'გაჩერდა.';
    const hl = anchor({
      startPosition: CHAPTER.length - tail.length,
      endPosition: CHAPTER.length,
      selectedText: tail,
    });
    expect(resolveHighlightRanges(CHAPTER, [hl])).toEqual([
      { id: 'h1', start: CHAPTER.length - tail.length, end: CHAPTER.length, color: 'yellow' },
    ]);
  });

  it('keeps the survivors when valid, drifted and vanished anchors are mixed', () => {
    const ranges = resolveHighlightRanges(CHAPTER, [
      anchor({ id: 'ok', startPosition: 7, endPosition: 14 }),
      anchor({ id: 'drifted', startPosition: 999, endPosition: 1003, selectedText: 'კარს' }),
      anchor({ id: 'gone', startPosition: 0, endPosition: 4, selectedText: 'xyzw' }),
    ]);
    expect(ranges.map((r) => r.id)).toEqual(['ok', 'drifted']);
  });

  it('keeps input order for fully identical ranges (stable sort)', () => {
    const ranges = resolveHighlightRanges(CHAPTER, [
      anchor({ id: 'first', startPosition: 7, endPosition: 14, color: 'yellow' }),
      anchor({ id: 'second', startPosition: 7, endPosition: 14, color: 'blue' }),
    ]);
    expect(ranges.map((r) => r.id)).toEqual(['first', 'second']);
  });

  it('orders the output by position regardless of the input order', () => {
    const input = [
      anchor({ id: 'c', startPosition: 23, endPosition: 30 }),
      anchor({ id: 'a', startPosition: 0, endPosition: 6 }),
      anchor({ id: 'b', startPosition: 7, endPosition: 14 }),
    ];
    const shuffled = [input[2], input[0], input[1]];
    expect(resolveHighlightRanges(CHAPTER, input)).toEqual(
      resolveHighlightRanges(CHAPTER, shuffled),
    );
  });

  it('does not mutate the input array', () => {
    const input = [
      anchor({ id: 'b', startPosition: 7, endPosition: 14 }),
      anchor({ id: 'a', startPosition: 0, endPosition: 6 }),
    ];
    const snapshot = input.map((h) => ({ ...h }));
    resolveHighlightRanges(CHAPTER, input);
    expect(input).toEqual(snapshot);
  });

  it('returns nothing for an empty chapter, whatever the anchors say', () => {
    expect(resolveHighlightRanges('', [anchor({ startPosition: 0, endPosition: 6 })])).toEqual([]);
  });
});

describe('segmentChapterText — overlapping colours and hostile ranges', () => {
  it('paints a three-way overlap of different colours without losing a character', () => {
    const ranges: HighlightRange[] = [
      { id: 'a', start: 0, end: 4, color: 'yellow' },
      { id: 'b', start: 2, end: 7, color: 'blue' },
      { id: 'c', start: 5, end: 9, color: 'red' },
    ];
    const segments = segmentChapterText('abcdefghij', ranges);
    expect(segments).toEqual([
      { text: 'abcd', start: 0, color: 'yellow' },
      { text: 'efg', start: 4, color: 'blue' },
      { text: 'hi', start: 7, color: 'red' },
      { text: 'j', start: 9, color: null },
    ]);
    expect(joined('abcdefghij', ranges)).toBe('abcdefghij');
  });

  it('ignores a zero-length range', () => {
    expect(segmentChapterText('abcdef', [{ id: 'a', start: 3, end: 3, color: 'red' }])).toEqual([
      { text: 'abcdef', start: 0, color: null },
    ]);
  });

  it('ignores an inverted range (end < start)', () => {
    expect(segmentChapterText('abcdef', [{ id: 'a', start: 4, end: 2, color: 'red' }])).toEqual([
      { text: 'abcdef', start: 0, color: null },
    ]);
  });

  it('clamps a negative start to the beginning of the text', () => {
    expect(segmentChapterText('abcdef', [{ id: 'a', start: -10, end: 2, color: 'red' }])).toEqual([
      { text: 'ab', start: 0, color: 'red' },
      { text: 'cdef', start: 2, color: null },
    ]);
  });

  it('ignores a range that lies entirely past the text', () => {
    expect(segmentChapterText('abc', [{ id: 'a', start: 10, end: 20, color: 'red' }])).toEqual([
      { text: 'abc', start: 0, color: null },
    ]);
  });

  it('covers the whole text with a single range and no plain segments', () => {
    expect(segmentChapterText('abc', [{ id: 'a', start: 0, end: 3, color: 'green' }])).toEqual([
      { text: 'abc', start: 0, color: 'green' },
    ]);
  });

  it('handles alternating single-character highlights', () => {
    const ranges: HighlightRange[] = [
      { id: 'a', start: 0, end: 1, color: 'yellow' },
      { id: 'b', start: 1, end: 2, color: 'blue' },
      { id: 'c', start: 2, end: 3, color: 'yellow' },
    ];
    expect(segmentChapterText('abc', ranges)).toEqual([
      { text: 'a', start: 0, color: 'yellow' },
      { text: 'b', start: 1, color: 'blue' },
      { text: 'c', start: 2, color: 'yellow' },
    ]);
  });

  it('keeps Georgian character offsets intact when segmenting', () => {
    const ranges: HighlightRange[] = [{ id: 'a', start: 7, end: 14, color: 'blue' }];
    const segments = segmentChapterText(CHAPTER, ranges);
    expect(segments[1]).toEqual({ text: 'ლამპარი', start: 7, color: 'blue' });
    expect(joined(CHAPTER, ranges)).toBe(CHAPTER);
  });

  it('never splits inside anything as long as offsets are honest UTF-16 units (emoji round trip)', () => {
    // Offsets are UTF-16 code units — an astral character occupies two of them.
    const text = 'ab😀cd';
    const ranges: HighlightRange[] = [{ id: 'a', start: 2, end: 4, color: 'red' }];
    expect(joined(text, ranges)).toBe(text);
    const painted = segmentChapterText(text, ranges).find((s) => s.color === 'red')!;
    expect(painted.text).toBe('😀');
  });

  it('round-trips arbitrary pseudo-random range sets exactly (property check)', () => {
    const random = makeRandom(0xb00c);
    const colors = ['yellow', 'green', 'blue', 'red'];

    for (let run = 0; run < 50; run++) {
      const textLength = 1 + Math.floor(random() * 40);
      const text = CHAPTER.repeat(2).slice(0, textLength);
      const rangeCount = Math.floor(random() * 6);
      const ranges: HighlightRange[] = [];
      for (let i = 0; i < rangeCount; i++) {
        // Deliberately unclamped and occasionally inverted or empty.
        const a = Math.floor(random() * (textLength + 10)) - 5;
        const b = Math.floor(random() * (textLength + 10)) - 5;
        ranges.push({ id: `r${i}`, start: a, end: b, color: colors[i % colors.length] });
      }

      const segments = segmentChapterText(text, ranges);
      // 1. Concatenation reproduces the input text exactly.
      expect(segments.map((s) => s.text).join('')).toBe(text);
      // 2. Every segment's offset agrees with its text.
      for (const segment of segments) {
        expect(text.slice(segment.start, segment.start + segment.text.length)).toBe(segment.text);
        expect(segment.text.length).toBeGreaterThan(0);
      }
      // 3. Segments are consecutive: each starts where the previous ended.
      let cursor = 0;
      for (const segment of segments) {
        expect(segment.start).toBe(cursor);
        cursor += segment.text.length;
      }
      // 4. Neighbouring segments never share a colour (they would have merged).
      for (let i = 1; i < segments.length; i++) {
        expect(segments[i].color).not.toBe(segments[i - 1].color);
      }
    }
  });
});

describe('selectionToChapterRange — boundaries and concatenated-chapter offsets', () => {
  // The reader concatenates chapters into one offset space; a selection can
  // land on either side of the separator or straddle it.
  const CH1 = 'პირველი თავი მთავრდება აქ.';
  const SEPARATOR = '\n\n';
  const CH2 = 'მეორე თავი იწყება აქ.';
  const BOOK = CH1 + SEPARATOR + CH2;
  const CH2_OFFSET = CH1.length + SEPARATOR.length;

  it('keeps offsets in the concatenated space for a selection inside a later chapter', () => {
    const range = selectionToChapterRange(BOOK, CH2_OFFSET, CH2_OFFSET + 5)!;
    expect(range.text).toBe('მეორე');
    expect(range.start).toBe(CH2_OFFSET);
    expect(BOOK.slice(range.start, range.end)).toBe(range.text);
  });

  it('trims the chapter separator out of a selection that straddles it', () => {
    const range = selectionToChapterRange(BOOK, CH1.length, CH2_OFFSET + 5)!;
    expect(range.text).toBe('მეორე');
    expect(range.start).toBe(CH2_OFFSET);
  });

  it('keeps a straddling selection that contains text on both sides', () => {
    const range = selectionToChapterRange(BOOK, CH1.length - 3, CH2_OFFSET + 5)!;
    expect(range.text).toBe('აქ.' + SEPARATOR + 'მეორე');
    expect(BOOK.slice(range.start, range.end)).toBe(range.text);
  });

  it('returns null for a caret at position 0', () => {
    expect(selectionToChapterRange(BOOK, 0, 0)).toBeNull();
  });

  it('returns null for a caret at the very end of the text', () => {
    expect(selectionToChapterRange(BOOK, BOOK.length, BOOK.length)).toBeNull();
  });

  it('returns null when both offsets are past the end (clamped to an empty range)', () => {
    expect(selectionToChapterRange(BOOK, BOOK.length + 5, BOOK.length + 50)).toBeNull();
  });

  it('returns null when both offsets are negative', () => {
    expect(selectionToChapterRange(BOOK, -10, -2)).toBeNull();
  });

  it('returns null for empty chapter text', () => {
    expect(selectionToChapterRange('', 0, 5)).toBeNull();
  });

  it('accepts a single-character selection of the first character', () => {
    expect(selectionToChapterRange('abc', 0, 1)).toEqual({ start: 0, end: 1, text: 'a' });
  });

  it('accepts a single-character selection of the last character', () => {
    expect(selectionToChapterRange('abc', 2, 3)).toEqual({ start: 2, end: 3, text: 'c' });
  });

  it('treats tabs and non-breaking whitespace as trimmable edges', () => {
    const text = 'a\t word \tb';
    const range = selectionToChapterRange(text, 1, text.length - 1)!;
    expect(range.text).toBe('word');
  });

  it('collapses a selection that spans only the separator to null', () => {
    expect(selectionToChapterRange(BOOK, CH1.length, CH2_OFFSET)).toBeNull();
  });
});

describe('full pipeline on concatenated chapters', () => {
  it('select → store → resolve → segment agrees across the chapter boundary', () => {
    const CH1 = 'პირველი თავი.';
    const BOOK = CH1 + '\n\n' + 'მეორე თავი.';

    const selection = selectionToChapterRange(BOOK, CH1.length - 5, BOOK.length)!;
    const stored: HighlightAnchor = {
      id: 'h1',
      startPosition: selection.start,
      endPosition: selection.end,
      selectedText: selection.text,
      color: 'green',
    };

    const ranges = resolveHighlightRanges(BOOK, [stored]);
    const segments = segmentChapterText(BOOK, ranges);

    expect(segments.map((s) => s.text).join('')).toBe(BOOK);
    const painted = segments.filter((s) => s.color === 'green').map((s) => s.text).join('');
    expect(painted).toBe(selection.text);
  });

  it('overlapping highlights of different colours survive the resolve → segment pipeline', () => {
    const anchors: HighlightAnchor[] = [
      anchor({ id: 'a', startPosition: 0, endPosition: 14, color: 'yellow' }),
      anchor({ id: 'b', startPosition: 7, endPosition: 21, color: 'blue' }),
    ];
    const segments = segmentChapterText(CHAPTER, resolveHighlightRanges(CHAPTER, anchors));

    expect(segments.map((s) => s.text).join('')).toBe(CHAPTER);
    // Earlier highlight owns the overlap; the later one keeps only its tail.
    expect(segments[0]).toEqual({ text: CHAPTER.slice(0, 14), start: 0, color: 'yellow' });
    expect(segments[1]).toEqual({ text: CHAPTER.slice(14, 21), start: 14, color: 'blue' });
  });
});
