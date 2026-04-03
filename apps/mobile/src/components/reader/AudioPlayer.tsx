import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { colors } from '@/theme/colors';

interface AudioChapter {
  audioChapterId: string;
  chapterNumber: number;
  duration: number | null;
  status: string;
}

interface Props {
  bookId: string;
  chapters: AudioChapter[];
  currentChapter: number;
  onChapterChange: (chapter: number) => void;
  getStreamUrl: (audioChapterId: string) => Promise<string | null>;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/**
 * Mobile Audio Player — Phase 6
 *
 * Uses expo-av for audio playback with background support.
 * expo-av must be installed: expo install expo-av
 *
 * Background playback requires Audio.setAudioModeAsync({
 *   staysActiveInBackground: true,
 *   playsInSilentModeIOS: true,
 * })
 */
export default function AudioPlayer({
  bookId, chapters, currentChapter, onChapterChange, getStreamUrl,
}: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1.0);
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const speedIndex = useRef(SPEED_OPTIONS.indexOf(1));

  const currentAudio = chapters.find(
    (c) => c.chapterNumber === currentChapter && c.status === 'COMPLETED',
  );

  // Load audio URL
  useEffect(() => {
    if (!currentAudio) { setAudioUrl(null); return; }

    setIsLoading(true);
    getStreamUrl(currentAudio.audioChapterId)
      .then((url) => setAudioUrl(url))
      .catch(() => setAudioUrl(null))
      .finally(() => setIsLoading(false));
  }, [currentAudio?.audioChapterId, getStreamUrl]);

  // Note: Actual expo-av Audio.Sound integration requires the expo-av package.
  // When expo-av is available, replace these stubs with:
  //   const { sound } = await Audio.Sound.createAsync({ uri: audioUrl });
  //   await sound.playAsync();
  //   sound.setOnPlaybackStatusUpdate(onStatus);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
    // expo-av: sound.playAsync() / sound.pauseAsync()
  }, []);

  const skip = useCallback((seconds: number) => {
    setPosition((prev) => Math.max(0, Math.min(duration, prev + seconds * 1000)));
    // expo-av: sound.setPositionAsync(newPosition)
  }, [duration]);

  const cycleSpeed = useCallback(() => {
    speedIndex.current = (speedIndex.current + 1) % SPEED_OPTIONS.length;
    setSpeed(SPEED_OPTIONS[speedIndex.current]);
    // expo-av: sound.setRateAsync(newSpeed, true)
  }, []);

  const nextChapter = () => {
    const next = chapters.find(
      (c) => c.chapterNumber > currentChapter && c.status === 'COMPLETED',
    );
    if (next) onChapterChange(next.chapterNumber);
  };

  const prevChapter = () => {
    const prev = [...chapters]
      .reverse()
      .find((c) => c.chapterNumber < currentChapter && c.status === 'COMPLETED');
    if (prev) onChapterChange(prev.chapterNumber);
  };

  const formatTime = (ms: number): string => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!currentAudio) {
    return (
      <View style={s.container}>
        <Text style={s.unavailable}>ხმოვანი წაკითხვა ამ თავისთვის მიუწვდომელია</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Controls */}
      <View style={s.controls}>
        <TouchableOpacity style={s.btn} onPress={prevChapter}>
          <Text style={s.btnText}>⏮</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btn} onPress={() => skip(-15)}>
          <Text style={s.skipText}>-15</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.btn, s.playBtn]}
          onPress={togglePlay}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={s.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={s.btn} onPress={() => skip(15)}>
          <Text style={s.skipText}>+15</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btn} onPress={nextChapter}>
          <Text style={s.btnText}>⏭</Text>
        </TouchableOpacity>
      </View>

      {/* Progress */}
      <View style={s.progressRow}>
        <Text style={s.timeText}>{formatTime(position)}</Text>
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: duration > 0 ? `${(position / duration) * 100}%` : '0%' }]} />
        </View>
        <Text style={s.timeText}>{formatTime(duration)}</Text>
      </View>

      {/* Speed */}
      <View style={s.metaRow}>
        <TouchableOpacity style={s.speedBtn} onPress={cycleSpeed}>
          <Text style={s.speedText}>{speed}x</Text>
        </TouchableOpacity>
        <Text style={s.chapterInfo}>
          თავი {currentChapter} / {chapters.length}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: colors.light.surface,
    borderTopWidth: 1,
    borderTopColor: colors.light.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  unavailable: {
    fontSize: 13,
    color: colors.light.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginBottom: 6,
  },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnText: { fontSize: 16, color: colors.light.text },
  skipText: { fontSize: 12, color: colors.light.textSecondary, fontWeight: '600' },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.light.primary,
  },
  playIcon: { fontSize: 16, color: '#fff' },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  timeText: {
    fontSize: 11,
    color: colors.light.textSecondary,
    width: 36,
    textAlign: 'center',
  },
  progressBar: {
    flex: 1,
    height: 3,
    backgroundColor: colors.light.border,
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.light.primary,
    borderRadius: 2,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  speedBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
  },
  speedText: { fontSize: 12, color: colors.light.text, fontWeight: '600' },
  chapterInfo: { fontSize: 12, color: colors.light.textSecondary },
});
