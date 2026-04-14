import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '@/services/api';
import { authService } from '@/services/auth';
import { connectSocket, disconnectSocket, getSocket } from '@/services/socket';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

interface UseNotificationsReturn {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  fetchNotifications: (page?: number) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
}

export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async (page = 1) => {
    try {
      const data = await apiRequest<{ notifications: Notification[]; total: number }>(
        `/notifications?page=${page}&limit=20`
      );
      if (page === 1) {
        setNotifications(data.notifications);
      } else {
        setNotifications((prev) => [...prev, ...data.notifications]);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const data = await apiRequest<{ count: number }>('/notifications/unread-count');
      setUnreadCount(data.count);
    } catch {
      // ignore
    }
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    try {
      await apiRequest(`/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // ignore
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await apiRequest('/notifications/read-all', { method: 'PATCH' });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  }, []);

  // WebSocket connection
  useEffect(() => {
    let mounted = true;

    (async () => {
      const token = await authService.getToken();
      if (!token || !mounted) return;

      const socket = connectSocket(token);

      socket.on('notification:new', (notification: Notification) => {
        if (!mounted) return;
        setNotifications((prev) => [notification, ...prev]);
        setUnreadCount((prev) => prev + 1);
      });

      socket.on('notification:unread-count', (count: number) => {
        if (!mounted) return;
        setUnreadCount(count);
      });
    })();

    return () => {
      mounted = false;
      disconnectSocket();
    };
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchNotifications(1);
    refreshUnreadCount();
  }, [fetchNotifications, refreshUnreadCount]);

  return {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    refreshUnreadCount,
  };
}
