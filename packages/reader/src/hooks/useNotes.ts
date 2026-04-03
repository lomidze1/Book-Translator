import { useState, useEffect, useCallback } from 'react';
import { readerApi } from '../api/reader-api';
import type { ReaderNote } from '../types';

export function useNotes(bookId: string, token: string | null) {
  const [notes, setNotes] = useState<ReaderNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !bookId) { setLoading(false); return; }

    readerApi.getNotes(token, bookId)
      .then(setNotes)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load notes'))
      .finally(() => setLoading(false));
  }, [bookId, token]);

  const addNote = useCallback(async (data: {
    chapterNumber: number;
    content: string;
    highlightId?: string;
  }) => {
    if (!token) return;
    const note = await readerApi.createNote(token, { bookId, ...data });
    setNotes((prev) => [...prev, note]);
    return note;
  }, [bookId, token]);

  const updateNote = useCallback(async (id: string, content: string) => {
    if (!token) return;
    const updated = await readerApi.updateNote(token, id, content);
    setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
  }, [token]);

  const removeNote = useCallback(async (id: string) => {
    if (!token) return;
    await readerApi.deleteNote(token, id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, [token]);

  return { notes, loading, error, addNote, updateNote, removeNote };
}
