import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationController } from '../../src/notification/notification.controller';
import { NotificationService } from '../../src/notification/notification.service';

describe('NotificationController', () => {
  let controller: NotificationController;
  let mockService: any;

  beforeEach(() => {
    mockService = {
      getNotifications: vi.fn(),
      getUnreadCount: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      getOrCreatePreferences: vi.fn(),
      updatePreferences: vi.fn(),
      subscribePush: vi.fn(),
      unsubscribePush: vi.fn(),
    };

    controller = new NotificationController(mockService as NotificationService);
  });

  const mockReq = { user: { id: 'user-1' } };

  describe('getNotifications', () => {
    it('should return paginated notifications', async () => {
      const expected = { notifications: [], total: 0, page: 1, limit: 20 };
      mockService.getNotifications.mockResolvedValue(expected);

      const result = await controller.getNotifications(mockReq, '1', '20');

      expect(result).toEqual(expected);
      expect(mockService.getNotifications).toHaveBeenCalledWith('user-1', 1, 20);
    });

    it('should use default page/limit when not provided', async () => {
      mockService.getNotifications.mockResolvedValue({ notifications: [] });

      await controller.getNotifications(mockReq);

      expect(mockService.getNotifications).toHaveBeenCalledWith('user-1', 1, 20);
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      mockService.getUnreadCount.mockResolvedValue(5);

      const result = await controller.getUnreadCount(mockReq);

      expect(result).toEqual({ count: 5 });
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      await controller.markAsRead(mockReq, 'notif-1');

      expect(mockService.markAsRead).toHaveBeenCalledWith('user-1', 'notif-1');
    });

    it('should return success', async () => {
      const result = await controller.markAsRead(mockReq, 'notif-1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', async () => {
      const result = await controller.markAllAsRead(mockReq);

      expect(mockService.markAllAsRead).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('getPreferences', () => {
    it('should return preferences', async () => {
      const prefs = { emailEnabled: true, pushEnabled: false };
      mockService.getOrCreatePreferences.mockResolvedValue(prefs);

      const result = await controller.getPreferences(mockReq);

      expect(result).toEqual(prefs);
    });
  });

  describe('updatePreferences', () => {
    it('should update preferences', async () => {
      const dto = { emailEnabled: false };
      const updated = { emailEnabled: false, pushEnabled: true };
      mockService.updatePreferences.mockResolvedValue(updated);

      const result = await controller.updatePreferences(mockReq, dto);

      expect(mockService.updatePreferences).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual(updated);
    });
  });

  describe('subscribePush', () => {
    it('should subscribe push endpoint', async () => {
      const dto = { endpoint: 'https://push.example.com', p256dh: 'key', auth: 'auth' };
      mockService.subscribePush.mockResolvedValue({ id: 'sub-1' });

      const result = await controller.subscribePush(mockReq, dto);

      expect(mockService.subscribePush).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('unsubscribePush', () => {
    it('should unsubscribe push endpoint', async () => {
      const result = await controller.unsubscribePush(mockReq, 'https://push.example.com');

      expect(mockService.unsubscribePush).toHaveBeenCalledWith('user-1', 'https://push.example.com');
      expect(result).toEqual({ success: true });
    });
  });
});
