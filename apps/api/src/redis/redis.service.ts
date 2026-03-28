import { Injectable, OnModuleInit, OnModuleDestroy, ServiceUnavailableException, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  async onModuleInit() {
    this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    try {
      await this.client.connect();
    } catch {
      this.logger.warn('Redis connection failed — OTP and rate limiting features disabled');
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  get isConnected(): boolean {
    return this.client?.status === 'ready';
  }

  // --- Standard methods (silent fail for non-critical operations) ---

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.isConnected) return;
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.isConnected) return null;
    return this.client.get(key);
  }

  async del(key: string): Promise<void> {
    if (!this.isConnected) return;
    await this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    if (!this.isConnected) return 0;
    return this.client.incr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    if (!this.isConnected) return;
    await this.client.expire(key, ttlSeconds);
  }

  // --- Secure methods (fail-closed for security-critical operations) ---

  private requireConnected(): void {
    if (!this.isConnected) {
      throw new ServiceUnavailableException('Security service temporarily unavailable');
    }
  }

  async secureSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.requireConnected();
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async secureGet(key: string): Promise<string | null> {
    this.requireConnected();
    return this.client.get(key);
  }

  async secureIncr(key: string): Promise<number> {
    this.requireConnected();
    return this.client.incr(key);
  }
}
