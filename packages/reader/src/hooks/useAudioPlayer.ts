import { useState, useEffect, useCallback } from 'react';
import { ttsApi, type AudioChapterInfo, type AudioBookStatus } from '../api/tts-api';

export type { AudioChapterInfo, AudioBookStatus };

export function useAudioPlayer(bookId: string, token: string | null) {
  const [chapters, setChapters] = useState<AudioChapterInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [audioBookId, setAudioBookId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Fetch audio chapters on mount
  useEffect(() => {
    if (!token || !bookId) { setLoading(false); return; }

    ttsApi.getChapters(token, bookId)
      .then((data) => {
        setChapters(data);
        if (data.length > 0) {
          // Audio exists for this book
          setStatus('available');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [bookId, token]);

  // Start synthesis for entire book
  const synthesizeBook = useCallback(async (voiceId?: string, speed?: number) => {
    if (!token) return;
    const result = await ttsApi.synthesizeBook(token, { bookId, voiceId, speed });
    setAudioBookId(result.audioBookId);
    setStatus('queued');
    return result;
  }, [bookId, token]);

  // Refresh status
  const refreshStatus = useCallback(async () => {
    if (!audioBookId || !token) return;
    const data = await ttsApi.getStatus(token, audioBookId);
    setStatus(data.status);
    setProgress(data.progress);
    setChapters(data.chapters);
    return data;
  }, [audioBookId, token]);

  // Get stream URL for a chapter
  const getStreamUrl = useCallback(async (audioChapterId: string) => {
    if (!token) return null;
    return ttsApi.getStreamUrl(token, audioChapterId);
  }, [token]);

  return {
    chapters,
    loading,
    audioBookId,
    status,
    progress,
    synthesizeBook,
    refreshStatus,
    getStreamUrl,
  };
}
