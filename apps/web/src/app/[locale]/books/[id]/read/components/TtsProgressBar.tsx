'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import styles from '../reader.module.scss';

interface Props {
  audioBookId: string;
  apiUrl: string;
  token: string;
  totalChapters: number;
  onComplete: () => void;
}

interface StatusData {
  id: string;
  status: string;
  progress: number;
  totalChapters: number;
  completedChapters: number;
  chapters: Array<{
    audioChapterId: string;
    chapterNumber: number;
    duration: number | null;
    status: string;
  }>;
}

export default function TtsProgressBar({ audioBookId, apiUrl, token, totalChapters, onComplete }: Props) {
  const t = useTranslations('reader');
  const [status, setStatus] = useState<StatusData | null>(null);
  const [progress, setProgress] = useState(0);
  const [completedChapters, setCompletedChapters] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(Date.now());

  // Poll for status updates
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/tts/status/${audioBookId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: StatusData = await res.json();
          setStatus(data);
          setProgress(data.progress);
          setCompletedChapters(data.completedChapters);

          if (data.status === 'COMPLETED') {
            if (pollRef.current) clearInterval(pollRef.current);
            onComplete();
          }

          if (data.status === 'FAILED') {
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      } catch {
        // Retry on next interval
      }
    };

    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [audioBookId, apiUrl, token, onComplete]);

  // Calculate ETA
  const getEta = (): string => {
    if (progress <= 0 || completedChapters <= 0) return '';
    const elapsed = (Date.now() - startTimeRef.current) / 1000 / 60; // minutes
    if (elapsed <= 0) return '';
    const rate = progress / elapsed; // progress per minute
    if (rate <= 0) return '';
    const remaining = (100 - progress) / rate;
    if (!isFinite(remaining) || remaining <= 0) return '';

    if (remaining < 1) return '< 1';
    return Math.round(remaining).toString();
  };

  const eta = getEta();

  return (
    <div className={styles.ttsProgress}>
      <div className={styles.ttsProgressHeader}>
        <span className={styles.ttsProgressTitle}>
          {status?.status === 'FAILED' ? t('tts_failed') : t('tts_generating')}
        </span>
        {status?.status === 'FAILED' && (
          <button className={styles.ttsRetryBtn} onClick={async () => {
            await fetch(`${apiUrl}/api/tts/retry/${audioBookId}`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
            });
            startTimeRef.current = Date.now();
          }}>
            {t('tts_retry')}
          </button>
        )}
      </div>

      <div
        className={styles.ttsProgressBarOuter}
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('tts_generating')}
      >
        <div
          className={styles.ttsProgressBarInner}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className={styles.ttsProgressInfo}>
        <span>{t('tts_chapter_progress', { current: completedChapters, total: totalChapters || status?.totalChapters || 0 })}</span>
        <span>{progress}%</span>
      </div>

      {eta && status?.status !== 'FAILED' && (
        <div className={styles.ttsEta}>
          {t('tts_remaining', { minutes: eta })}
        </div>
      )}
    </div>
  );
}
