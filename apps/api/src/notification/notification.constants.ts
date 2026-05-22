export const NOTIFICATION_QUEUE = 'notification';

// Re-exported for backwards compatibility with existing imports in this module.
// New code should import directly from `common/redis-connection`.
export { getRedisConnection } from '../common/redis-connection';
