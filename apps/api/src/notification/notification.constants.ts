export const NOTIFICATION_QUEUE = 'notification';

export function getRedisConnection() {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  };
}
