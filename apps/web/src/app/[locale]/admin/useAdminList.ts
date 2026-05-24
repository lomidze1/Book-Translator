'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiJson } from '@/lib/api-client';

interface AdminListResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

interface UseAdminListOptions {
  endpoint: string;
  pageSize?: number;
  extraQuery?: Record<string, string | undefined>;
}

export function useAdminList<T>({ endpoint, pageSize = 50, extraQuery }: UseAdminListOptions) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  // Serialize extraQuery once so unstable object identity from parent renders
  // doesn't cause extra fetches. Effects depend on this string, not the object.
  const extraQueryKey = useMemo(() => JSON.stringify(extraQuery ?? {}), [extraQuery]);

  // Reset to page 1 whenever the search term or filter values change so users
  // don't end up on an empty page after narrowing the query.
  useEffect(() => {
    setPage(1);
  }, [search, extraQueryKey]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      page: String(page),
      limit: String(pageSize),
    });
    if (search.trim()) params.set('search', search.trim());
    const parsedExtra = JSON.parse(extraQueryKey) as Record<string, string | undefined>;
    for (const [k, v] of Object.entries(parsedExtra)) {
      if (v) params.set(k, v);
    }

    setLoading(true);
    setError('');

    (async () => {
      try {
        const data = await apiJson<AdminListResponse<T>>(`${endpoint}?${params}`);
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [endpoint, page, pageSize, search, extraQueryKey, refreshKey]);

  return {
    items,
    total,
    page,
    setPage,
    search,
    setSearch,
    loading,
    error,
    refresh,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}
