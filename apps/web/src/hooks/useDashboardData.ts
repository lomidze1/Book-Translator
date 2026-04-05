'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface TranslationItem {
  id: string;
  status: string;
  progress: number;
  createdAt: string;
  book: {
    id: string;
    title: string;
    author?: string;
    coverUrl?: string;
  };
}

export interface DashboardStats {
  totalBooks: number;
  inProgress: number;
  completed: number;
}

export interface DashboardData {
  translations: TranslationItem[];
  stats: DashboardStats;
  recentActivity: TranslationItem[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useDashboardData(): DashboardData {
  const [translations, setTranslations] = useState<TranslationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setRetryCount(prev => prev + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const token = localStorage.getItem('accessToken');
    if (!token) { setLoading(false); return; }

    async function fetchWithRetry(attempts = 3, delay = 1000) {
      for (let i = 0; i < attempts; i++) {
        try {
          const res = await fetch(`${API_URL}/api/translations/my`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          });

          if (res.status === 401) {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('cachedUser');
            throw new Error('Unauthorized');
          }
          if (!res.ok) throw new Error('Failed to fetch');

          const data = await res.json();
          setTranslations(data);
          return;
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          if (i === attempts - 1) {
            setError(err instanceof Error ? err.message : 'Error');
            return;
          }
          await new Promise(r => setTimeout(r, delay * Math.pow(2, i)));
        }
      }
    }

    fetchWithRetry().finally(() => setLoading(false));

    return () => controller.abort();
  }, [retryCount]);

  const stats = useMemo<DashboardStats>(() => {
    const completed = translations.filter((item) => item.status === 'COMPLETED');
    const inProgress = translations.filter((item) => item.status !== 'COMPLETED' && item.status !== 'FAILED');
    return {
      totalBooks: new Set(translations.map((item) => item.book.id)).size,
      inProgress: inProgress.length,
      completed: completed.length,
    };
  }, [translations]);

  const recentActivity = useMemo(() => {
    return [...translations]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [translations]);

  return { translations, stats, recentActivity, loading, error, retry };
}
