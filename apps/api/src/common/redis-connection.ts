/**
 * Single source of truth for the BullMQ Redis connection.
 *
 * Previously each queue-using module (translation, tts, notification) shipped
 * its own copy of this function. They were identical, but: (1) a TLS / ACL
 * change would have to land in three places, and (2) `redis.service.ts`
 * reads `REDIS_URL` while these read `REDIS_HOST`/`REDIS_PORT` — a
 * misconfigured env could route BullMQ and ioredis to different instances.
 */
export interface RedisConnectionOptions {
  host: string;
  port: number;
  password?: string;
  username?: string;
}

export function getRedisConnection(): RedisConnectionOptions {
  // Prefer REDIS_URL when provided (works with managed Redis offerings).
  const url = process.env.REDIS_URL;
  if (url) {
    try {
      const parsed = new URL(url);
      return {
        host: parsed.hostname || 'localhost',
        port: parseInt(parsed.port || '6379', 10),
        username: parsed.username || undefined,
        password: parsed.password || undefined,
      };
    } catch {
      // Fall through to host/port env vars.
    }
  }

  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  };
}
