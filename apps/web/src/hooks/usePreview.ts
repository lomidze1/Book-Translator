'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch, getAccessToken } from '@/lib/api-client';

export type PreviewStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface Preview {
  id: string;
  status: PreviewStatus;
  targetLanguage: string;
  content: string | null;
  sourceText: string | null;
  sourceWordCount: number | null;
  chapterNumber: number | null;
  editorPass: boolean;
}

export type PreviewError = 'quota' | 'unavailable' | 'login' | 'network' | null;

// Generation measured at ~150s on a 1000-word slice, so a tight poll would just
// add ~50 pointless round trips. Matches the translation-polling cadence.
const POLL_INTERVAL_MS = 5000;
const IN_FLIGHT: PreviewStatus[] = ['PENDING', 'IN_PROGRESS'];

/**
 * Loads a book's free preview and, while one is generating, polls until it
 * settles. Mirrors the polling shape in BookDetailPage (immediate first call,
 * then an interval, skip on 429) but at a shorter cadence — a preview is one
 * Claude call, not a whole book.
 */
export function usePreview(bookId: string | undefined) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<PreviewError>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  const fetchPreview = useCallback(async (): Promise<Preview | null> => {
    if (!bookId || !getAccessToken()) return null;

    const res = await apiFetch(`/api/previews/book/${bookId}`);
    // 404 is the normal "never generated" case, not an error.
    if (res.status === 404) return null;
    // Skip this cycle rather than spamming a throttled endpoint.
    if (res.status === 429 || !res.ok) return null;

    return (await res.json()) as Preview;
  }, [bookId]);

  // Initial load.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await fetchPreview();
        if (cancelled) return;
        setPreview(data);
        if (data && IN_FLIGHT.includes(data.status)) setGenerating(true);
      } catch {
        if (!cancelled) setError('network');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchPreview]);

  // Poll only while something is actually in flight.
  useEffect(() => {
    if (!generating) {
      stopPolling();
      return;
    }

    const poll = async () => {
      try {
        const data = await fetchPreview();
        if (!data) return;
        setPreview(data);
        if (!IN_FLIGHT.includes(data.status)) setGenerating(false);
      } catch {
        // Transient — the next tick retries.
      }
    };

    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return stopPolling;
  }, [generating, fetchPreview, stopPolling]);

  const generate = useCallback(async () => {
    if (!bookId) return;
    if (!getAccessToken()) {
      setError('login');
      return;
    }

    setError(null);
    setGenerating(true);

    try {
      const res = await apiFetch('/api/previews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId }),
      });

      if (!res.ok) {
        setGenerating(false);
        const body = await res.json().catch(() => ({}));
        const message = String(body?.message ?? '');
        if (message.includes('PREVIEW_QUOTA_EXCEEDED')) setError('quota');
        else if (res.status === 403) setError('unavailable');
        else setError('network');
        return;
      }

      const created = (await res.json()) as { id: string; status: PreviewStatus; cached: boolean };

      // A cached hit is already done — pull the content instead of polling.
      if (created.cached || created.status === 'COMPLETED') {
        setGenerating(false);
        setPreview(await fetchPreview());
        return;
      }

      setPreview((prev) => (prev ? { ...prev, status: created.status } : prev));
    } catch {
      setGenerating(false);
      setError('network');
    }
  }, [bookId, fetchPreview]);

  return { preview, loading, generating, error, generate };
}
