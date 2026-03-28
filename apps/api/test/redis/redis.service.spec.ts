import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisService } from '../../src/redis/redis.service';

// Mock ioredis
vi.mock('ioredis', () => {
  const MockRedis = vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue('OK'),
    set: vi.fn().mockResolvedValue('OK'),
    setex: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    status: 'ready',
  }));
  return { default: MockRedis };
});

describe('RedisService', () => {
  let service: RedisService;
  let mockClient: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new RedisService();
    await service.onModuleInit();
    // Access internal client
    mockClient = (service as any).client;
  });

  describe('onModuleInit', () => {
    it('should connect to Redis successfully', async () => {
      expect(mockClient.connect).toHaveBeenCalled();
    });

    it('should handle connection failure gracefully', async () => {
      const failService = new RedisService();
      const Redis = (await import('ioredis')).default as any;
      Redis.mockImplementationOnce(() => ({
        connect: vi.fn().mockRejectedValue(new Error('Connection refused')),
        status: 'end',
      }));

      // Should not throw
      await expect(failService.onModuleInit()).resolves.not.toThrow();
    });
  });

  describe('onModuleDestroy', () => {
    it('should quit Redis connection', async () => {
      await service.onModuleDestroy();
      expect(mockClient.quit).toHaveBeenCalled();
    });
  });

  describe('isConnected', () => {
    it('should return true when client status is ready', () => {
      expect(service.isConnected).toBe(true);
    });

    it('should return false when client status is not ready', () => {
      mockClient.status = 'end';
      expect(service.isConnected).toBe(false);
    });
  });

  describe('set', () => {
    it('should set value without TTL', async () => {
      await service.set('key1', 'value1');
      expect(mockClient.set).toHaveBeenCalledWith('key1', 'value1');
    });

    it('should set value with TTL using setex', async () => {
      await service.set('key1', 'value1', 300);
      expect(mockClient.setex).toHaveBeenCalledWith('key1', 300, 'value1');
    });

    it('should silently skip when disconnected', async () => {
      mockClient.status = 'end';
      await service.set('key1', 'value1');
      expect(mockClient.set).not.toHaveBeenCalled();
      expect(mockClient.setex).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('should return stored value', async () => {
      mockClient.get.mockResolvedValue('stored-value');
      const result = await service.get('key1');
      expect(result).toBe('stored-value');
      expect(mockClient.get).toHaveBeenCalledWith('key1');
    });

    it('should return null for non-existent key', async () => {
      mockClient.get.mockResolvedValue(null);
      const result = await service.get('missing');
      expect(result).toBeNull();
    });

    it('should return null when disconnected', async () => {
      mockClient.status = 'end';
      const result = await service.get('key1');
      expect(result).toBeNull();
      expect(mockClient.get).not.toHaveBeenCalled();
    });
  });

  describe('del', () => {
    it('should delete key', async () => {
      await service.del('key1');
      expect(mockClient.del).toHaveBeenCalledWith('key1');
    });

    it('should silently skip when disconnected', async () => {
      mockClient.status = 'end';
      await service.del('key1');
      expect(mockClient.del).not.toHaveBeenCalled();
    });
  });

  describe('incr', () => {
    it('should increment and return new value', async () => {
      mockClient.incr.mockResolvedValue(5);
      const result = await service.incr('counter');
      expect(result).toBe(5);
      expect(mockClient.incr).toHaveBeenCalledWith('counter');
    });

    it('should return 0 when disconnected (security note: rate limiting bypassed)', async () => {
      mockClient.status = 'end';
      const result = await service.incr('counter');
      expect(result).toBe(0);
      expect(mockClient.incr).not.toHaveBeenCalled();
    });
  });

  describe('expire', () => {
    it('should set TTL on key', async () => {
      await service.expire('key1', 600);
      expect(mockClient.expire).toHaveBeenCalledWith('key1', 600);
    });

    it('should silently skip when disconnected', async () => {
      mockClient.status = 'end';
      await service.expire('key1', 600);
      expect(mockClient.expire).not.toHaveBeenCalled();
    });
  });

  describe('secure methods (fail-closed)', () => {
    it('secureGet should throw ServiceUnavailableException when disconnected', async () => {
      mockClient.status = 'end';
      await expect(service.secureGet('key1')).rejects.toThrow('Security service temporarily unavailable');
    });

    it('secureGet should return value when connected', async () => {
      mockClient.get.mockResolvedValue('value');
      const result = await service.secureGet('key1');
      expect(result).toBe('value');
    });

    it('secureIncr should throw ServiceUnavailableException when disconnected', async () => {
      mockClient.status = 'end';
      await expect(service.secureIncr('key1')).rejects.toThrow('Security service temporarily unavailable');
    });

    it('secureIncr should work when connected', async () => {
      mockClient.incr.mockResolvedValue(3);
      const result = await service.secureIncr('counter');
      expect(result).toBe(3);
    });

    it('secureSet should throw ServiceUnavailableException when disconnected', async () => {
      mockClient.status = 'end';
      await expect(service.secureSet('key1', 'val')).rejects.toThrow('Security service temporarily unavailable');
    });

    it('secureSet should work with TTL when connected', async () => {
      await service.secureSet('key1', 'val', 300);
      expect(mockClient.setex).toHaveBeenCalledWith('key1', 300, 'val');
    });
  });

  describe('rate limiting integration', () => {
    it('should support OTP rate limiting pattern', async () => {
      mockClient.incr.mockResolvedValueOnce(1);
      const count = await service.incr('otp:rate:+995599123456');
      expect(count).toBe(1);

      await service.expire('otp:rate:+995599123456', 60);
      expect(mockClient.expire).toHaveBeenCalledWith('otp:rate:+995599123456', 60);
    });

    it('should support login brute-force protection pattern', async () => {
      // Simulate 10 failed login attempts
      for (let i = 1; i <= 10; i++) {
        mockClient.incr.mockResolvedValueOnce(i);
        const attempts = await service.incr('login:attempts:test@example.com');
        expect(attempts).toBe(i);
      }
    });

    it('should support OTP storage with TTL', async () => {
      await service.set('otp:+995599123456', '123456', 300);
      expect(mockClient.setex).toHaveBeenCalledWith('otp:+995599123456', 300, '123456');

      mockClient.get.mockResolvedValue('123456');
      const otp = await service.get('otp:+995599123456');
      expect(otp).toBe('123456');
    });
  });
});
