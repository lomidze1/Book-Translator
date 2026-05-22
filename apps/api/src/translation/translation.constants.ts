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
