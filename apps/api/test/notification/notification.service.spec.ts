import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationService } from '../../src/notification/notification.service';
import { NotificationGateway } from '../../src/notification/notification.gateway';

// Mock BullMQ Queue
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  })),
}));

describe('NotificationService', () => {
  let service: NotificationService;
  let mockPrisma: any;
  let mockGateway: any;

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';

    mockPrisma = {
      user: {
        findUnique: vi.fn(),
      },
      notification: {
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        updateMany: vi.fn(),
      },
      notificationPreference: {
        findUnique: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
      },
      pushSubscription: {
        upsert: vi.fn(),
        deleteMany: vi.fn(),
      },
    };

    mockGateway = {
      emitNotification: vi.fn(),
      emitUnreadCount: vi.fn(),
    };

    service = new NotificationService(mockPrisma, mockGateway);
  });

  describe('notify', () => {
    it('should create notification and emit WebSocket event', async () => {
      const userId = 'user-1';
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        email: 'test@test.com',
        locale: 'ka',
        name: 'Test',
        notificationPreference: {
          emailEnabled: true,
          pushEnabled: false,
          inAppEnabled: true,
          translationCompleted: true,
          ttsCompleted: true,
          paymentReceipt: true,
        },
      });

      mockPrisma.notification.create.mockResolvedValue({
        id: 'notif-1',
        userId,
        type: 'TRANSLATION_COMPLETED',
        title: 'თარგმანი დასრულდა',
        body: 'test body',
        read: false,
      });

      mockPrisma.notification.count.mockResolvedValue(1);

      await service.notify({
        userId,
        type: 'TRANSLATION_COMPLETED',
        titleKa: '���არგმანი დასრულდა',
        titleEn: 'Translation Completed',
        bodyKa: 'test body',
        bodyEn: 'test body en',
      });

      const createCall = mockPrisma.notification.create.mock.calls[0][0];
      expect(createCall.data.userId).toBe(userId);
      expect(createCall.data.type).toBe('TRANSLATION_COMPLETED');
      // Georgian title from titleKa param (locale=ka)
      expect(createCall.data.title).toBeDefined();
      expect(createCall.data.title.length).toBeGreaterThan(0);
      expect(createCall.data.body).toBe('test body');
      expect(mockGateway.emitNotification).toHaveBeenCalled();
      expect(mockGateway.emitUnreadCount).toHaveBeenCalledWith(userId, 1);
    });

    it('should skip notification if event toggle is disabled', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        locale: 'ka',
        name: 'Test',
        notificationPreference: {
          emailEnabled: true,
          pushEnabled: true,
          inAppEnabled: true,
          translationCompleted: false,
          ttsCompleted: true,
          paymentReceipt: true,
        },
      });

      await service.notify({
        userId: 'user-1',
        type: 'TRANSLATION_COMPLETED',
        titleKa: 'test',
        titleEn: 'test',
        bodyKa: 'body',
        bodyEn: 'body',
      });

      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
      expect(mockGateway.emitNotification).not.toHaveBeenCalled();
    });

    it('should use English title/body when user locale is en', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        locale: 'en',
        name: 'Test',
        notificationPreference: {
          emailEnabled: false,
          pushEnabled: false,
          inAppEnabled: true,
          translationCompleted: true,
          ttsCompleted: true,
          paymentReceipt: true,
        },
      });

      mockPrisma.notification.create.mockResolvedValue({ id: 'n-1' });
      mockPrisma.notification.count.mockResolvedValue(1);

      await service.notify({
        userId: 'user-1',
        type: 'TRANSLATION_COMPLETED',
        titleKa: 'ქართული',
        titleEn: 'English',
        bodyKa: 'ქართული body',
        bodyEn: 'English body',
      });

      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'English',
          body: 'English body',
        }),
      });
    });

    it('should not create in-app if inAppEnabled is false', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        locale: 'ka',
        notificationPreference: {
          emailEnabled: true,
          pushEnabled: false,
          inAppEnabled: false,
          translationCompleted: true,
          ttsCompleted: true,
          paymentReceipt: true,
        },
      });

      await service.notify({
        userId: 'user-1',
        type: 'TRANSLATION_COMPLETED',
        titleKa: 'test',
        titleEn: 'test',
        bodyKa: 'body',
        bodyEn: 'body',
      });

      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
      expect(mockGateway.emitNotification).not.toHaveBeenCalled();
    });
  });

  describe('getNotifications', () => {
    it('should return paginated notifications', async () => {
      const notifs = [{ id: '1' }, { id: '2' }];
      mockPrisma.notification.findMany.mockResolvedValue(notifs);
      mockPrisma.notification.count.mockResolvedValue(5);

      const result = await service.getNotifications('user-1', 1, 20);

      expect(result.notifications).toEqual(notifs);
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
    });

    it('should enforce minimum page of 1', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count.mockResolvedValue(0);

      const result = await service.getNotifications('user-1', -5, 20);
      expect(result.page).toBe(1);
    });
  });

  describe('markAsRead', () => {
    it('should update notification read status', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });

      await service.markAsRead('user-1', 'notif-1');

      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId: 'user-1' },
        data: expect.objectContaining({ read: true }),
      });
    });
  });

  describe('markAllAsRead', () => {
    it('should update all unread notifications', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 3 });

      await service.markAllAsRead('user-1');

      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', read: false },
        data: expect.objectContaining({ read: true }),
      });
    });
  });

  describe('getOrCreatePreferences', () => {
    it('should return existing preferences', async () => {
      const prefs = { id: 'p-1', userId: 'user-1', emailEnabled: true };
      mockPrisma.notificationPreference.findUnique.mockResolvedValue(prefs);

      const result = await service.getOrCreatePreferences('user-1');
      expect(result).toEqual(prefs);
    });

    it('should create default preferences if none exist', async () => {
      mockPrisma.notificationPreference.findUnique.mockResolvedValue(null);
      mockPrisma.notificationPreference.create.mockResolvedValue({
        id: 'p-1',
        userId: 'user-1',
        emailEnabled: true,
      });

      const result = await service.getOrCreatePreferences('user-1');
      expect(mockPrisma.notificationPreference.create).toHaveBeenCalledWith({
        data: { userId: 'user-1' },
      });
      expect(result.emailEnabled).toBe(true);
    });
  });

  describe('updatePreferences', () => {
    it('should upsert preferences', async () => {
      mockPrisma.notificationPreference.upsert.mockResolvedValue({ id: 'p-1' });

      await service.updatePreferences('user-1', { emailEnabled: false });

      expect(mockPrisma.notificationPreference.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        create: { userId: 'user-1', emailEnabled: false },
        update: { emailEnabled: false },
      });
    });
  });

  describe('subscribePush', () => {
    it('should upsert push subscription', async () => {
      mockPrisma.pushSubscription.upsert.mockResolvedValue({ id: 's-1' });

      await service.subscribePush('user-1', {
        endpoint: 'https://push.example.com/sub1',
        p256dh: 'key1',
        auth: 'auth1',
      });

      expect(mockPrisma.pushSubscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { endpoint: 'https://push.example.com/sub1' },
        }),
      );
    });
  });

  describe('unsubscribePush', () => {
    it('should delete push subscription', async () => {
      mockPrisma.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });

      await service.unsubscribePush('user-1', 'https://push.example.com/sub1');

      expect(mockPrisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', endpoint: 'https://push.example.com/sub1' },
      });
    });
  });

  describe('getUnreadCount', () => {
    it('should return count of unread notifications', async () => {
      mockPrisma.notification.count.mockResolvedValue(7);

      const result = await service.getUnreadCount('user-1');
      expect(result).toBe(7);
      expect(mockPrisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', read: false },
      });
    });
  });
});
