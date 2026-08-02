import {
  PREVIEW_WORD_COUNT,
  PREVIEW_OVERSHOOT_WORDS,
  PREVIEW_MAX_CHARS,
  PREVIEW_MIN_RATIO,
  PREVIEW_WHOLE_CHAPTER_RATIO,
} from './preview.constants';

export interface PreviewSlice {
  text: string;
  wordCount: number;
  /** False when the whole chapter fit inside the budget. */
  truncated: boolean;
}

/**
 * Sentence terminator followed by any closing punctuation, then whitespace or
 * end-of-string. The closing group keeps `…said."` intact instead of orphaning
 * the quote onto the next slice.
 */
const SENTENCE_END = /[.!?…]["'”’»)\]]*(?=\s|$)/g;

/**
 * Take the opening ~`targetWords` words of a chapter, cutting on a sentence
 * boundary so the preview reads as a finished excerpt rather than a hard stop.
 *
 * Offsets are tracked against the ORIGINAL string — never split/rejoin on
 * whitespace, which would flatten the paragraph breaks the reader UI splits on.
 */
export function slicePreviewText(
  content: string,
  targetWords: number = PREVIEW_WORD_COUNT,
): PreviewSlice {
  if (!content || !content.trim()) {
    return { text: '', wordCount: 0, truncated: false };
  }

  // End offset of every word, in order.
  const wordEnds: number[] = [];
  for (const match of content.matchAll(/\S+/g)) {
    wordEnds.push(match.index + match[0].length);
  }
  const totalWords = wordEnds.length;

  // Short enough to ship whole — avoids leaving a meaningless orphan tail.
  if (totalWords <= targetWords * PREVIEW_WHOLE_CHAPTER_RATIO) {
    return clamp(content.trimEnd(), totalWords, false);
  }

  const cut = wordEnds[targetWords - 1];
  const overshootLimit = wordEnds[Math.min(targetWords + PREVIEW_OVERSHOOT_WORDS, totalWords) - 1];
  const minCut = wordEnds[Math.max(Math.floor(targetWords * PREVIEW_MIN_RATIO), 1) - 1];

  // Prefer finishing the sentence we landed in; otherwise fall back to the last
  // completed sentence, but never below PREVIEW_MIN_RATIO of the promised length.
  const boundary =
    firstSentenceEnd(content, cut, overshootLimit) ?? lastSentenceEnd(content, minCut, cut);

  if (boundary !== null) {
    const text = content.slice(0, boundary).trimEnd();
    return clamp(text, countWords(text), true);
  }

  // A wall of text with no punctuation (badly-OCR'd PDFs) — cut on the word
  // boundary and signal the break explicitly.
  const text = `${content.slice(0, cut).trimEnd()}…`;
  return clamp(text, targetWords, true);
}

/** First sentence end at or after `from`, no later than `limit`. */
function firstSentenceEnd(content: string, from: number, limit: number): number | null {
  for (const match of content.slice(from, limit).matchAll(SENTENCE_END)) {
    return from + match.index + match[0].length;
  }
  return null;
}

/** Last sentence end inside [floor, ceiling]. */
function lastSentenceEnd(content: string, floor: number, ceiling: number): number | null {
  let best: number | null = null;
  for (const match of content.slice(floor, ceiling).matchAll(SENTENCE_END)) {
    best = floor + match.index + match[0].length;
  }
  return best;
}

/**
 * Guarantee the slice fits in one Claude call. Cuts back to a word boundary so
 * the hard ceiling can never split a word (or a multi-byte character).
 */
function clamp(text: string, wordCount: number, truncated: boolean): PreviewSlice {
  if (text.length <= PREVIEW_MAX_CHARS) {
    return { text, wordCount, truncated };
  }
  const head = text.slice(0, PREVIEW_MAX_CHARS - 1);
  const lastSpace = head.search(/\s\S*$/);
  const trimmed = `${(lastSpace > 0 ? head.slice(0, lastSpace) : head).trimEnd()}…`;
  return { text: trimmed, wordCount: countWords(trimmed), truncated: true };
}

function countWords(text: string): number {
  return (text.match(/\S+/g) || []).length;
}
