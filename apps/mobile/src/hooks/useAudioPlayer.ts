/**
 * useAudioPlayer — Mobile Audio Player Hook (Phase 6)
 *
 * Wraps expo-av Audio.Sound for playback with:
 * - Background playback support
 * - Sleep timer
 * - Speed control
 * - Auto-advance to next chapter
 *
 * Requires: expo-av (expo install expo-av)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { audioCacheService } from '../services/audio-cache';

interface AudioChapter {
  audioChapterId: string;
  chapterNumber: number;
  duration: number | null;
  status: string;
}

interface AudioPlayerState {
  isPlaying: boolean;
  isLoading: boolean;
  position: number; // ms
  duration: number; // ms
  speed: number;
  sleepTimer: number | null; // minutes remaining
  currentChapter: number;
  error: string | null;
}

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export function useAudioPlayer(
  chapters: AudioChapter[],
  initialChapter: number,
  getStreamUrl: (audioChapterId: string) => Promise<string | null>,
) {
  const [state, setState] = useState<AudioPlayerState>({
    isPlaying: false,
    isLoading: false,
    position: 0,
    duration: 0,
    speed: 1.0,
    sleepTimer: null,
    currentChapter: initialChapter,
    error: null,
  });

  const soundRef = useRef<any>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentAudio = chapters.find(
    (c) => c.chapterNumber === state.currentChapter && c.status === 'COMPLETED',
  );

  // Setup audio mode for background playback
  useEffect(() => {
    (async () => {
      try {
        const { Audio } = await import('expo-av');
        await Audio.setAudioModeAsync({
          staysActiveInBackground: true,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
        });
      } catch {
        // expo-av not available
      }
    })();
  }, []);

  // Load audio when chapter changes
  useEffect(() => {
    if (!currentAudio) return;

    let cancelled = false;

    const loadAudio = async () => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // Check cache first
        let uri = await audioCacheService.getCachedPath(currentAudio.audioChapterId);

        if (!uri) {
          uri = await getStreamUrl(currentAudio.audioChapterId);
        }

        if (!uri || cancelled) return;

        const { Audio } = await import('expo-av');

        // Unload previous sound
        if (soundRef.current) {
          await soundRef.current.unloadAsync().catch(() => {});
        }

        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: false, rate: state.speed, shouldCorrectPitch: true },
          (status: any) => {
            if (!status.isLoaded) return;
            setState((prev) => ({
              ...prev,
              position: status.positionMillis || 0,
              duration: status.durationMillis || 0,
              isPlaying: status.isPlaying || false,
            }));

            // Auto-advance when finished
            if (status.didJustFinish) {
              nextChapter();
            }
          },
        );

        soundRef.current = sound;
        setState((prev) => ({ ...prev, isLoading: false }));
      } catch (err) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: err instanceof Error ? err.message : 'Audio load failed',
          }));
        }
      }
    };

    loadAudio();

    return () => {
      cancelled = true;
    };
  }, [currentAudio?.audioChapterId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
      if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
    };
  }, []);

  const togglePlay = useCallback(async () => {
    if (!soundRef.current) return;
    try {
      if (state.isPlaying) {
        await soundRef.current.pauseAsync();
      } else {
        await soundRef.current.playAsync();
      }
    } catch {
      // ignore
    }
  }, [state.isPlaying]);

  const seek = useCallback(async (positionMs: number) => {
    if (!soundRef.current) return;
    try {
      await soundRef.current.setPositionAsync(Math.max(0, positionMs));
    } catch {
      // ignore
    }
  }, []);

  const skip = useCallback(async (seconds: number) => {
    const newPos = state.position + seconds * 1000;
    await seek(Math.max(0, Math.min(state.duration, newPos)));
  }, [state.position, state.duration, seek]);

  const setSpeed = useCallback(async (speed: number) => {
    setState((prev) => ({ ...prev, speed }));
    if (soundRef.current) {
      try {
        await soundRef.current.setRateAsync(speed, true);
      } catch {
        // ignore
      }
    }
  }, []);

  const cycleSpeed = useCallback(() => {
    const currentIdx = SPEED_OPTIONS.indexOf(state.speed);
    const nextIdx = (currentIdx + 1) % SPEED_OPTIONS.length;
    setSpeed(SPEED_OPTIONS[nextIdx]);
  }, [state.speed, setSpeed]);

  const nextChapter = useCallback(() => {
    const next = chapters.find(
      (c) => c.chapterNumber > state.currentChapter && c.status === 'COMPLETED',
    );
    if (next) {
      setState((prev) => ({
        ...prev,
        currentChapter: next.chapterNumber,
        position: 0,
      }));
    } else {
      // No more chapters — stop
      setState((prev) => ({ ...prev, isPlaying: false }));
    }
  }, [chapters, state.currentChapter]);

  const prevChapter = useCallback(() => {
    // If position > 3s, restart current chapter
    if (state.position > 3000) {
      seek(0);
      return;
    }

    const prev = [...chapters]
      .reverse()
      .find((c) => c.chapterNumber < state.currentChapter && c.status === 'COMPLETED');
    if (prev) {
      setState((prev) => ({
        ...prev,
        currentChapter: prev.chapterNumber,
        position: 0,
      }));
    }
  }, [chapters, state.currentChapter, state.position, seek]);

  const setSleepTimer = useCallback((minutes: number | null) => {
    // Clear existing timer
    if (sleepTimerRef.current) {
      clearInterval(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }

    setState((prev) => ({ ...prev, sleepTimer: minutes }));

    if (minutes === null) return;

    sleepTimerRef.current = setInterval(() => {
      setState((prev) => {
        if (prev.sleepTimer === null || prev.sleepTimer <= 1) {
          // Time's up — pause
          soundRef.current?.pauseAsync().catch(() => {});
          if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
          return { ...prev, sleepTimer: null, isPlaying: false };
        }
        return { ...prev, sleepTimer: prev.sleepTimer - 1 };
      });
    }, 60000); // Every minute
  }, []);

  const downloadChapter = useCallback(async (chapterId: string) => {
    const url = await getStreamUrl(chapterId);
    if (url) {
      return audioCacheService.cacheAudio(chapterId, url);
    }
    return null;
  }, [getStreamUrl]);

  const prefetchNextChapters = useCallback(async () => {
    const currentIdx = chapters.findIndex(
      (c) => c.chapterNumber === state.currentChapter,
    );
    const toDownload = chapters
      .slice(currentIdx + 1, currentIdx + 4) // Next 3
      .filter((c) => c.status === 'COMPLETED' && !audioCacheService.isCached(c.audioChapterId));

    for (const ch of toDownload) {
      await downloadChapter(ch.audioChapterId);
    }
  }, [chapters, state.currentChapter, downloadChapter]);

  return {
    ...state,
    togglePlay,
    seek,
    skip,
    setSpeed,
    cycleSpeed,
    nextChapter,
    prevChapter,
    setSleepTimer,
    downloadChapter,
    prefetchNextChapters,
    speedOptions: SPEED_OPTIONS,
  };
}
