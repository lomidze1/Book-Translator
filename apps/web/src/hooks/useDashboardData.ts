'use client';

import { useState, useEffect, useMemo } from 'react';

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
}

export function useDashboardData(): DashboardData {
  const [translations, setTranslations] = useState<TranslationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const token = localStorage.getItem('accessToken');
    if (!token) { setLoading(false); return; }

    fetch(`${API_URL}/api/translations/my`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((res) => {
        if (res.status === 401) {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('cachedUser');
          throw new Error('Unauthorized');
        }
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then(setTranslations)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Error');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

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

  return { translations, stats, recentActivity, loading, error };
}
