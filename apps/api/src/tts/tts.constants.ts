export const TTS_QUEUE = 'tts-audio';

// Re-exported for backwards compatibility with existing imports in this module.
// New code should import directly from `common/redis-connection`.
export { getRedisConnection } from '../common/redis-connection';

// Shared BullMQ retry policy for TTS jobs. Previously inlined in four places
// across tts.service.ts.
export const TTS_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
};
