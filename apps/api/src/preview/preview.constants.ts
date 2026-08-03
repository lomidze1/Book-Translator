export const PREVIEW_QUEUE = 'book-preview';

// Re-exported to match the house style in translation.constants.ts / tts.constants.ts.
export { getRedisConnection } from '../common/redis-connection';

// attempts: 2, not 3 — every retry is a real Claude spend. One retry covers a
// transient 429/5xx; a second would mostly burn money on deterministic failures.
//
// removeOnComplete/removeOnFail are REQUIRED here. With a deterministic jobId and
// no removal policy, BullMQ keeps the finished job forever and silently no-ops any
// later add() with the same id — that is exactly the trap TRANSLATION_JOB_OPTIONS
// falls into, and why translation.service.clearQueuedJob has to exist.
export const PREVIEW_JOB_OPTIONS = {
  attempts: 2,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};

export function previewJobId(previewId: string): string {
  return `preview-${previewId}`;
}

/** 250 words = 1 page everywhere in this codebase, so 1000 words ≈ 4 pages. */
export const PREVIEW_WORD_COUNT = 1000;

/** How far past the target we may run to finish the sentence we landed in. */
export const PREVIEW_OVERSHOOT_WORDS = 60;

/**
 * Hard ceiling, kept below claude.service's MAX_CHUNK_SIZE (12000) so a preview
 * is always exactly ONE Claude call. No pathological input can turn one preview
 * into twenty API calls.
 */
export const PREVIEW_MAX_CHARS = 7500;

/** Skip front matter / TOC entries that parse into tiny chapters. */
export const PREVIEW_MIN_CHAPTER_WORDS = 300;

/** Falling back backwards must not produce a preview shorter than this fraction. */
export const PREVIEW_MIN_RATIO = 0.75;

/** A chapter only slightly over target is returned whole — no orphan tail. */
export const PREVIEW_WHOLE_CHAPTER_RATIO = 1.2;
