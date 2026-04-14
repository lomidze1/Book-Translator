import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiRequest } from '@/services/api';

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

interface DashboardStats {
  totalBooks: number;
  inProgress: number;
  completed: number;
}

interface DashboardData {
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

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<TranslationItem[]>('/translations/my');
      setTranslations(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load');
      setTranslations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const stats = useMemo<DashboardStats>(() => {
    const bookIds = new Set(translations.map((t) => t.book.id));
    return {
      totalBooks: bookIds.size,
      inProgress: translations.filter((t) => t.status !== 'COMPLETED' && t.status !== 'FAILED').length,
      completed: translations.filter((t) => t.status === 'COMPLETED').length,
    };
  }, [translations]);

  const recentActivity = useMemo(() => {
    return [...translations]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [translations]);

  return { translations, stats, recentActivity, loading, error, retry: fetchData };
}
