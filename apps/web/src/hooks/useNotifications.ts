'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  read: boolean;
  readAt?: string;
  createdAt: string;
}

export function useNotifications(onNewNotification?: (n: Notification) => void) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const callbackRef = useRef(onNewNotification);
  callbackRef.current = onNewNotification;

  // Fetch initial data
  const fetchUnreadCount = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/api/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count);
      }
    } catch {
      // silent
    }
  }, []);

  const fetchNotifications = useCallback(async (page = 1) => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/api/notifications?page=${page}&limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (page === 1) {
          setNotifications(data.notifications);
        } else {
          setNotifications(prev => [...prev, ...data.notifications]);
        }
        setTotal(data.total);
      }
    } catch {
      // silent
    }
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    try {
      await fetch(`${API_URL}/api/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {
      // silent
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    try {
      await fetch(`${API_URL}/api/notifications/read-all`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true, readAt: new Date().toISOString() })));
      setUnreadCount(0);
    } catch {
      // silent
    }
  }, []);

  // WebSocket connection
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    fetchUnreadCount();

    const socket = io(`${API_URL}/notifications`, {
      auth: { token },
      transports: ['websocket'],
    });

    socket.on('notification:new', (notification: Notification) => {
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
      callbackRef.current?.(notification);
    });

    socket.on('notification:unread-count', (count: number) => {
      setUnreadCount(count);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [fetchUnreadCount]);

  return {
    notifications,
    unreadCount,
    total,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
  };
}
