import { useState, useEffect, useCallback } from 'react';
import { readerApi } from '../api/reader-api';
import type { Highlight, HighlightColor } from '../types';

export function useHighlights(bookId: string, token: string | null) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !bookId) { setLoading(false); return; }

    readerApi.getHighlights(token, bookId)
      .then(setHighlights)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load highlights'))
      .finally(() => setLoading(false));
  }, [bookId, token]);

  const addHighlight = useCallback(async (data: {
    chapterNumber: number;
    startPosition: number;
    endPosition: number;
    selectedText: string;
    color?: HighlightColor;
  }) => {
    if (!token) return;
    const hl = await readerApi.createHighlight(token, { bookId, ...data });
    setHighlights((prev) => [...prev, hl]);
    return hl;
  }, [bookId, token]);

  const updateColor = useCallback(async (id: string, color: HighlightColor) => {
    if (!token) return;
    const updated = await readerApi.updateHighlightColor(token, id, color);
    setHighlights((prev) => prev.map((h) => (h.id === id ? { ...h, color: updated.color } : h)));
  }, [token]);

  const removeHighlight = useCallback(async (id: string) => {
    if (!token) return;
    await readerApi.deleteHighlight(token, id);
    setHighlights((prev) => prev.filter((h) => h.id !== id));
  }, [token]);

  return { highlights, loading, error, addHighlight, updateColor, removeHighlight };
}
