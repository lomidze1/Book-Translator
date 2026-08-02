import { describe, it, expect } from 'vitest';
import {
  resolveHighlightRanges,
  segmentChapterText,
  selectionToChapterRange,
  type HighlightAnchor,
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

describe('selectionToChapterRange', () => {
  it('slices the quote out of the chapter text so offsets and text always agree', () => {
    const range = selectionToChapterRange(CHAPTER, 7, 14)!;
    expect(CHAPTER.slice(range.start, range.end)).toBe(range.text);
    expect(range.text).toBe('ლამპარი');
  });

  it('normalises a backwards selection', () => {
    expect(selectionToChapterRange(CHAPTER, 14, 7)).toEqual(
      selectionToChapterRange(CHAPTER, 7, 14)
    );
  });

  it('trims whitespace dragged in at either edge', () => {
    const range = selectionToChapterRange(CHAPTER, 6, 15)!;
    expect(range.text).toBe('ლამპარი');
    expect(range.start).toBe(7);
    expect(range.end).toBe(14);
  });

  it('rejects an empty or whitespace-only selection', () => {
    expect(selectionToChapterRange(CHAPTER, 5, 5)).toBeNull();
    expect(selectionToChapterRange(CHAPTER, 21, 23)).toBeNull();
  });

  it('clamps offsets that run past the text', () => {
    const range = selectionToChapterRange(CHAPTER, -5, CHAPTER.length + 50)!;
    expect(range.start).toBe(0);
    expect(range.end).toBe(CHAPTER.length);
    expect(range.text).toBe(CHAPTER);
  });

  it('keeps the API contract: endPosition is at least 1', () => {
    const range = selectionToChapterRange(CHAPTER, 0, 6)!;
    expect(range.end).toBeGreaterThanOrEqual(1);
  });
});

describe('resolveHighlightRanges', () => {
  it('trusts stored positions when they still match the quote', () => {
    expect(resolveHighlightRanges(CHAPTER, [anchor({ startPosition: 7, endPosition: 14 })])).toEqual([
      { id: 'h1', start: 7, end: 14, color: 'yellow' },
    ]);
  });

  it('falls back to the first occurrence when positions drifted', () => {
    const drifted = anchor({ startPosition: 100, endPosition: 107, selectedText: 'ლამპარი' });
    expect(resolveHighlightRanges(CHAPTER, [drifted])).toEqual([
      { id: 'h1', start: 7, end: 14, color: 'yellow' },
    ]);
  });

  it('drops highlights whose text no longer exists', () => {
    const gone = anchor({ startPosition: 0, endPosition: 5, selectedText: 'აღარ არსებობს' });
    expect(resolveHighlightRanges(CHAPTER, [gone])).toEqual([]);
  });

  it('drops empty ranges — the API rejects them anyway', () => {
    const empty = anchor({ startPosition: 3, endPosition: 3, selectedText: '' });
    expect(resolveHighlightRanges(CHAPTER, [empty])).toEqual([]);
  });

  it('sorts by start, longest first on a tie', () => {
    const ranges = resolveHighlightRanges(CHAPTER, [
      anchor({ id: 'b', startPosition: 7, endPosition: 14 }),
      anchor({ id: 'a', startPosition: 0, endPosition: 6 }),
      anchor({ id: 'c', startPosition: 0, endPosition: 21 }),
    ]);
    expect(ranges.map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('segmentChapterText', () => {
  const join = (text: string, ranges: Parameters<typeof segmentChapterText>[1]) =>
    segmentChapterText(text, ranges)
      .map((s) => s.text)
      .join('');

  it('returns one plain segment when nothing is highlighted', () => {
    expect(segmentChapterText(CHAPTER, [])).toEqual([{ text: CHAPTER, start: 0, color: null }]);
  });

  it('splits around a highlight in the middle', () => {
    const segments = segmentChapterText('abcdef', [{ id: 'h1', start: 2, end: 4, color: 'green' }]);
    expect(segments).toEqual([
      { text: 'ab', start: 0, color: null },
      { text: 'cd', start: 2, color: 'green' },
      { text: 'ef', start: 4, color: null },
    ]);
  });

  it('never drops or duplicates a character, whatever the ranges', () => {
    const cases = [
      [{ id: 'a', start: 0, end: 3, color: 'yellow' }],
      [{ id: 'a', start: 0, end: 6, color: 'yellow' }],
      [
        { id: 'a', start: 0, end: 3, color: 'yellow' },
        { id: 'b', start: 3, end: 6, color: 'blue' },
      ],
      [
        { id: 'a', start: 1, end: 4, color: 'yellow' },
        { id: 'b', start: 2, end: 6, color: 'blue' },
      ],
      [
        { id: 'a', start: 0, end: 6, color: 'yellow' },
        { id: 'b', start: 2, end: 3, color: 'blue' },
      ],
    ];
    for (const ranges of cases) {
      expect(join('abcdef', ranges)).toBe('abcdef');
    }
  });

  it('merges adjacent ranges of the same colour into one segment', () => {
    const segments = segmentChapterText('abcdef', [
      { id: 'a', start: 0, end: 3, color: 'yellow' },
      { id: 'b', start: 3, end: 6, color: 'yellow' },
    ]);
    expect(segments).toEqual([{ text: 'abcdef', start: 0, color: 'yellow' }]);
  });

  it('keeps adjacent ranges of different colours apart', () => {
    const segments = segmentChapterText('abcdef', [
      { id: 'a', start: 0, end: 3, color: 'yellow' },
      { id: 'b', start: 3, end: 6, color: 'blue' },
    ]);
    expect(segments).toEqual([
      { text: 'abc', start: 0, color: 'yellow' },
      { text: 'def', start: 3, color: 'blue' },
    ]);
  });

  it('gives the overlap to the earlier highlight', () => {
    const segments = segmentChapterText('abcdef', [
      { id: 'a', start: 1, end: 4, color: 'yellow' },
      { id: 'b', start: 2, end: 6, color: 'blue' },
    ]);
    expect(segments).toEqual([
      { text: 'a', start: 0, color: null },
      { text: 'bcd', start: 1, color: 'yellow' },
      { text: 'ef', start: 4, color: 'blue' },
    ]);
  });

  it('colours a fully nested highlight with the enclosing one', () => {
    const segments = segmentChapterText('abcdef', [
      { id: 'a', start: 0, end: 6, color: 'yellow' },
      { id: 'b', start: 2, end: 3, color: 'blue' },
    ]);
    expect(segments).toEqual([{ text: 'abcdef', start: 0, color: 'yellow' }]);
  });

  it('clamps ranges that reach past the text', () => {
    const segments = segmentChapterText('abc', [{ id: 'a', start: 1, end: 99, color: 'red' }]);
    expect(segments).toEqual([
      { text: 'a', start: 0, color: null },
      { text: 'bc', start: 1, color: 'red' },
    ]);
  });

  it('handles empty text', () => {
    expect(segmentChapterText('', [{ id: 'a', start: 0, end: 3, color: 'red' }])).toEqual([]);
  });

  it('segment offsets stay usable as chapter offsets', () => {
    const segments = segmentChapterText(CHAPTER, [{ id: 'h1', start: 7, end: 14, color: 'blue' }]);
    for (const segment of segments) {
      expect(CHAPTER.slice(segment.start, segment.start + segment.text.length)).toBe(segment.text);
    }
  });
});

describe('round trip: select → store → resolve → render', () => {
  it('paints exactly the characters that were selected', () => {
    const selection = selectionToChapterRange(CHAPTER, 23, 31)!;

    const stored: HighlightAnchor = {
      id: 'h1',
      startPosition: selection.start,
      endPosition: selection.end,
      selectedText: selection.text,
      color: 'yellow',
    };

    const ranges = resolveHighlightRanges(CHAPTER, [stored]);
    const painted = segmentChapterText(CHAPTER, ranges)
      .filter((s) => s.color)
      .map((s) => s.text)
      .join('');

    expect(painted).toBe(selection.text);
    expect(painted).toBe('ელოუენი');
  });
});
