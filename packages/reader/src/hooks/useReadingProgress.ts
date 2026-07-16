import { useState, useEffect, useCallback, useRef } from 'react';
import { readerApi } from '../api/reader-api';
import type { ReadingPosition } from '../types';

const AUTO_SAVE_INTERVAL = 30_000; // 30 seconds

export function useReadingProgress(bookId: string, token: string | null) {
  const [progress, setProgress] = useState<ReadingPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const pendingRef = useRef<{ currentChapter: number; currentPosition: number; percentage: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load saved progress on mount
  useEffect(() => {
    if (!token || !bookId) { setLoading(false); return; }

    readerApi.getProgress(token, bookId)
      .then((data) => setProgress(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [bookId, token]);

  // Auto-save interval
  useEffect(() => {
    if (!token) return;

    timerRef.current = setInterval(() => {
      if (pendingRef.current && token) {
        readerApi.saveProgress(token, { bookId, ...pendingRef.current })
          .then((saved) => setProgress(saved))
          .catch(() => {});
        pendingRef.current = null;
      }
    }, AUTO_SAVE_INTERVAL);

    // Flush on tab close/navigation — keepalive lets the request outlive
    // the page, unlike the plain fetch in the unmount path.
    const flushOnHide = () => {
      if (!pendingRef.current || !token) return;
      readerApi.saveProgressKeepalive(token, { bookId, ...pendingRef.current });
      pendingRef.current = null;
    };
    // Guarded for React Native, where window.addEventListener is absent
    const canListen = typeof window !== 'undefined' && typeof window.addEventListener === 'function';
    if (canListen) {
      window.addEventListener('pagehide', flushOnHide);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (canListen) {
        window.removeEventListener('pagehide', flushOnHide);
      }
      // Save on unmount
      if (pendingRef.current && token) {
        readerApi.saveProgress(token, { bookId, ...pendingRef.current }).catch(() => {});
      }
    };
  }, [bookId, token]);

  const updateProgress = useCallback((currentChapter: number, currentPosition: number, percentage: number) => {
    pendingRef.current = { currentChapter, currentPosition, percentage };
  }, []);

  const saveNow = useCallback(async () => {
    if (!pendingRef.current || !token) return;
    try {
      const saved = await readerApi.saveProgress(token, { bookId, ...pendingRef.current });
      setProgress(saved);
      pendingRef.current = null;
    } catch {}
  }, [bookId, token]);

  return { progress, loading, updateProgress, saveNow };
}
