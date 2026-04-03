import { useState, useEffect, useCallback } from 'react';
import { readerApi } from '../api/reader-api';
import type { Bookmark } from '../types';

export function useBookmarks(bookId: string, token: string | null) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !bookId) { setLoading(false); return; }

    readerApi.getBookmarks(token, bookId)
      .then(setBookmarks)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load bookmarks'))
      .finally(() => setLoading(false));
  }, [bookId, token]);

  const addBookmark = useCallback(async (chapterNumber: number, position: number, label?: string) => {
    if (!token) return;
    try {
      const bm = await readerApi.createBookmark(token, { bookId, chapterNumber, position, label });
      setBookmarks((prev) => [...prev, bm]);
      return bm;
    } catch (err: unknown) {
      if (err instanceof Error && err.message?.includes('უკვე არსებობს')) return null;
      throw err;
    }
  }, [bookId, token]);

  const removeBookmark = useCallback(async (id: string) => {
    if (!token) return;
    await readerApi.deleteBookmark(token, id);
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  }, [token]);

  return { bookmarks, loading, error, addBookmark, removeBookmark };
}
