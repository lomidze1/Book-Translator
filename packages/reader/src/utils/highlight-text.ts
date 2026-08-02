/**
 * Character geometry for highlights, shared by every reader surface.
 *
 * A highlight is stored as a pair of character offsets into the chapter's
 * `translatedContent`, and the whole cross-platform contract is this invariant:
 *
 *   translatedContent.slice(startPosition, endPosition) === selectedText
 *
 * As long as web and mobile both produce and consume offsets in that space, a
 * highlight made on one device lands on the same words on the other.
 */

/** Stored highlight, narrowed to the fields the geometry depends on. */
export interface HighlightAnchor {
  id: string;
  startPosition: number;
  endPosition: number;
  selectedText: string;
  color: string;
}

/** A highlight resolved against the current chapter text. */
export interface HighlightRange {
  id: string;
  start: number;
  end: number;
  color: string;
}

/** A run of chapter text that is rendered with a single (or no) highlight colour. */
export interface TextSegment {
  text: string;
  /** Offset of this run inside the chapter text — also a stable render key. */
  start: number;
  color: string | null;
}

export interface SelectionRange {
  start: number;
  end: number;
  text: string;
}

/**
 * Resolve stored highlights against the chapter text.
 *
 * Positions are authoritative while they still match the stored quote;
 * otherwise fall back to the first occurrence of the quote, which keeps rows
 * usable after the translation text shifts. Anything that can no longer be
 * located is dropped rather than drawn in the wrong place.
 */
export function resolveHighlightRanges(
  chapterText: string,
  highlights: HighlightAnchor[]
): HighlightRange[] {
  const ranges: HighlightRange[] = [];

  for (const hl of highlights) {
    let start = hl.startPosition;
    let end = hl.endPosition;

    if (chapterText.slice(start, end) !== hl.selectedText) {
      const idx = chapterText.indexOf(hl.selectedText);
      if (idx === -1) continue;
      start = idx;
      end = idx + hl.selectedText.length;
    }

    if (end > start) ranges.push({ id: hl.id, start, end, color: hl.color });
  }

  // Earlier start wins an overlap; the longer range wins a tie.
  return ranges.sort((a, b) => a.start - b.start || b.end - a.end);
}

/**
 * Cut the chapter text into consecutive runs, each carrying the colour of the
 * highlight covering it (or `null` for plain text).
 *
 * Splitting on every range boundary means overlapping and adjacent highlights
 * neither drop nor duplicate a character: joining the segments always
 * reproduces `chapterText` exactly.
 */
export function segmentChapterText(
  chapterText: string,
  ranges: HighlightRange[]
): TextSegment[] {
  if (chapterText.length === 0) return [];

  const covering = ranges
    .map((r) => ({
      start: Math.max(0, Math.min(r.start, chapterText.length)),
      end: Math.max(0, Math.min(r.end, chapterText.length)),
      color: r.color,
    }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  if (covering.length === 0) {
    return [{ text: chapterText, start: 0, color: null }];
  }

  const boundaries = new Set<number>([0, chapterText.length]);
  for (const r of covering) {
    boundaries.add(r.start);
    boundaries.add(r.end);
  }
  const points = [...boundaries].sort((a, b) => a - b);

  const segments: TextSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    const hit = covering.find((r) => r.start <= from && r.end >= to);
    const color = hit ? hit.color : null;
    const previous = segments[segments.length - 1];

    if (previous && previous.color === color) {
      previous.text += chapterText.slice(from, to);
    } else {
      segments.push({ text: chapterText.slice(from, to), start: from, color });
    }
  }

  return segments;
}

/**
 * Turn a raw selection into a storable range.
 *
 * Offsets are normalised (a backwards drag reports end < start), clamped to the
 * text, and stripped of surrounding whitespace so a sloppy drag doesn't store
 * leading or trailing blanks as part of the quote. `text` is sliced back out of
 * the chapter text so the stored quote always matches the stored offsets.
 * Returns `null` when nothing but whitespace was selected.
 */
export function selectionToChapterRange(
  chapterText: string,
  selectionStart: number,
  selectionEnd: number
): SelectionRange | null {
  const lo = Math.min(selectionStart, selectionEnd);
  const hi = Math.max(selectionStart, selectionEnd);

  let start = Math.max(0, Math.min(lo, chapterText.length));
  let end = Math.max(0, Math.min(hi, chapterText.length));

  while (start < end && /\s/.test(chapterText[start])) start++;
  while (end > start && /\s/.test(chapterText[end - 1])) end--;

  if (end <= start) return null;

  return { start, end, text: chapterText.slice(start, end) };
}
