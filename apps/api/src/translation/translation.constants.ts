export const TRANSLATION_QUEUE = 'translation';

// Re-exported for backwards compatibility with existing imports in this module.
// New code should import directly from `common/redis-connection`.
export { getRedisConnection } from '../common/redis-connection';

// Shared BullMQ retry policy for translation jobs. Hoisted from inline literals
// so the policy lives in one place.
export const TRANSLATION_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
};

// How long an IN_PROGRESS translation can sit untouched before an admin is
// allowed to consider it stuck and retry it. Worker heartbeats bump the row's
// updatedAt as progress increments, so a row that hasn't moved in 30 minutes
// is almost certainly orphaned (crashed worker, lost Redis lease, etc.). The
// threshold is intentionally generous — a slow chapter can take a few
// minutes, and we'd rather wait than clobber a working job.
export const STUCK_TRANSLATION_THRESHOLD_MS = 30 * 60 * 1000;

// Deterministic BullMQ job id. Re-using the same id makes the queue itself
// reject double-enqueues, so an admin spamming "Retry" or a webhook firing
// twice can't stack duplicate workers on the same translation.
export function translationJobId(translationId: string): string {
  return `translate-${translationId}`;
}

/**
 * Separate queue for the STANDARD-tier batch editor. Its own queue because the
 * translation worker runs at concurrency 1 — a poll job waiting behind a
 * multi-hour book translation would never run.
 */
export const EDITOR_BATCH_QUEUE = 'editor-batch';

/** How long to wait between checks on a running Message Batch. */
export const EDITOR_BATCH_POLL_DELAY_MS = 5 * 60 * 1000;

/**
 * Batches expire after 24h, so stop polling a little past that rather than
 * re-enqueueing forever if a batch never reaches a terminal state.
 */
export const EDITOR_BATCH_MAX_POLLS = Math.ceil((25 * 60 * 60 * 1000) / EDITOR_BATCH_POLL_DELAY_MS);

export const EDITOR_BATCH_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 30000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};
