import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PushService } from '../../src/notification/push.service';

describe('PushService', () => {
  let service: PushService;
  let mockPrisma: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma = {
      pushSubscription: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
      },
    };

    // No VAPID keys — push disabled
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    service = new PushService(mockPrisma);
  });

  describe('sendToUser', () => {
    it('should silently skip when VAPID keys are not set', async () => {
      await service.sendToUser('user-1', { title: 'Test', body: 'Body' });

      expect(mockPrisma.pushSubscription.findMany).not.toHaveBeenCalled();
    });
  });

  describe('constructor', () => {
    it('should initialize without error when VAPID keys are missing', () => {
      expect(service).toBeDefined();
    });
  });
});
