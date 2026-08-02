'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import styles from '../reader.module.scss';

interface AudioChapter {
  audioChapterId: string;
  chapterNumber: number;
  duration: number | null;
  status: string;
}

interface Props {
  chapters: AudioChapter[];
  currentChapter: number;
  onChapterChange: (chapter: number) => void;
  getStreamUrl: (audioChapterId: string) => Promise<string | null>;
  bookTitle: string;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SLEEP_OPTIONS = [15, 30, 60];

export default function AudioPlayer({
  chapters, currentChapter, onChapterChange, getStreamUrl, bookTitle,
}: Props) {
  const t = useTranslations('reader');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1.0);
  const [isLoading, setIsLoading] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [sleepTimer, setSleepTimer] = useState<number | null>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentChapterAudio = chapters.find(
    (c) => c.chapterNumber === currentChapter && c.status === 'COMPLETED',
  );
  const currentAudioChapterId = currentChapterAudio?.audioChapterId;

  // Load audio for current chapter (speed excluded — handled separately)
  useEffect(() => {
    if (!currentAudioChapterId) return;
    let cancelled = false;

    const loadAudio = async () => {
      setIsLoading(true);
      try {
        const url = await getStreamUrl(currentAudioChapterId);
        if (url && audioRef.current && !cancelled) {
          audioRef.current.src = url;
          audioRef.current.load();
        }
      } catch {
        // Ignore load errors
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadAudio();
    return () => { cancelled = true; };
  }, [currentAudioChapterId, getStreamUrl]);

  // Time update handler
  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    // Auto-advance to next chapter
    const nextChapter = chapters.find(
      (c) => c.chapterNumber === currentChapter + 1 && c.status === 'COMPLETED',
    );
    if (nextChapter) {
      onChapterChange(nextChapter.chapterNumber);
    }
  }, [currentChapter, chapters, onChapterChange]);

  // Sleep timer
  useEffect(() => {
    if (sleepTimer === null) return;
    sleepTimerRef.current = setInterval(() => {
      setSleepTimer((prev) => {
        if (prev === null || prev <= 1) {
          if (audioRef.current) audioRef.current.pause();
          setIsPlaying(false);
          if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
          return null;
        }
        return prev - 1;
      });
    }, 60000);
    return () => { if (sleepTimerRef.current) clearInterval(sleepTimerRef.current); };
  }, [sleepTimer]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const skip = useCallback((seconds: number) => {
    if (audioRef.current) {
      seek(Math.max(0, Math.min(duration, audioRef.current.currentTime + seconds)));
    }
  }, [duration, seek]);

  const setPlaybackSpeed = (s: number) => {
    setSpeed(s);
    if (audioRef.current) audioRef.current.playbackRate = s;
  };

  const changeVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolume(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
  }, []);

  const nextChapter = useCallback(() => {
    const next = chapters.find(
      (c) => c.chapterNumber > currentChapter && c.status === 'COMPLETED',
    );
    if (next) onChapterChange(next.chapterNumber);
  }, [chapters, currentChapter, onChapterChange]);

  const prevChapter = useCallback(() => {
    const prev = [...chapters]
      .reverse()
      .find((c) => c.chapterNumber < currentChapter && c.status === 'COMPLETED');
    if (prev) onChapterChange(prev.chapterNumber);
  }, [chapters, currentChapter, onChapterChange]);

  // Media Session API
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${t('chapter', { number: currentChapter })}`,
        artist: bookTitle,
      });
      navigator.mediaSession.setActionHandler('play', () => togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => togglePlay());
      navigator.mediaSession.setActionHandler('previoustrack', () => prevChapter());
      navigator.mediaSession.setActionHandler('nexttrack', () => nextChapter());
    }
  }, [currentChapter, bookTitle, togglePlay, prevChapter, nextChapter, t]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          if (e.shiftKey) prevChapter();
          else skip(-15);
          break;
        case 'ArrowRight':
          if (e.shiftKey) nextChapter();
          else skip(15);
          break;
        case 'ArrowUp':
          e.preventDefault();
          changeVolume(volume + 0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          changeVolume(volume - 0.1);
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePlay, prevChapter, nextChapter, volume, skip, changeVolume]);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!currentChapterAudio) return null;

  return (
    <div className={`${styles.audioPlayer} ${isMinimized ? styles.audioMinimized : ''}`}>
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        preload="auto"
      />

      <div className={styles.audioControls}>
        <button className={styles.audioBtn} onClick={prevChapter} aria-label={t('tts_prev_chapter')}>⏮</button>
        <button className={styles.audioBtn} onClick={() => skip(-15)} aria-label={t('tts_rewind_15')}>-15</button>
        <button
          className={`${styles.audioBtn} ${styles.audioPlayBtn}`}
          onClick={togglePlay}
          disabled={isLoading}
          aria-label={isPlaying ? t('tts_pause') : t('tts_play')}
        >
          {isLoading ? '⏳' : isPlaying ? '⏸' : '▶'}
        </button>
        <button className={styles.audioBtn} onClick={() => skip(15)} aria-label={t('tts_forward_15')}>+15</button>
        <button className={styles.audioBtn} onClick={nextChapter} aria-label={t('tts_next_chapter')}>⏭</button>
      </div>

      <div className={styles.audioProgress}>
        <span className={styles.audioTime}>{formatTime(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          value={currentTime}
          onChange={(e) => seek(Number(e.target.value))}
          className={styles.audioSlider}
        />
        <span className={styles.audioTime}>{formatTime(duration)}</span>
      </div>

      <div className={styles.audioMeta}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => changeVolume(Number(e.target.value))}
          className={styles.audioVolumeSlider}
          title={t('tts_volume')}
        />

        <select
          value={speed}
          onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
          className={styles.audioSelect}
        >
          {SPEED_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}x</option>
          ))}
        </select>

        <select
          value={sleepTimer ?? ''}
          onChange={(e) => setSleepTimer(e.target.value ? Number(e.target.value) : null)}
          className={styles.audioSelect}
        >
          <option value="">{t('tts_sleep_timer')}</option>
          {SLEEP_OPTIONS.map((m) => (
            <option key={m} value={m}>{t('tts_sleep_minutes', { minutes: m })}</option>
          ))}
        </select>

        <button
          className={styles.audioBtn}
          onClick={() => setIsMinimized(!isMinimized)}
        >
          {isMinimized ? '▲' : '▼'}
        </button>
      </div>
    </div>
  );
}
