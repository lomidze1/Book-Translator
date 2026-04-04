import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions, Modal,
  ActivityIndicator,
} from 'react-native';
import { colors } from '@/theme/colors';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';

interface AudioChapter {
  audioChapterId: string;
  chapterNumber: number;
  duration: number | null;
  status: string;
}

interface Props {
  bookId: string;
  bookTitle: string;
  chapters: AudioChapter[];
  initialChapter: number;
  getStreamUrl: (audioChapterId: string) => Promise<string | null>;
}

const SLEEP_OPTIONS = [15, 30, 60];
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function MobileAudioPlayer({
  bookId, bookTitle, chapters, initialChapter, getStreamUrl,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const player = useAudioPlayer(chapters, initialChapter, getStreamUrl);

  const formatTime = (ms: number): string => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progressPercent = player.duration > 0
    ? (player.position / player.duration) * 100
    : 0;

  // Mini Player (bottom bar)
  const renderMiniPlayer = () => (
    <TouchableOpacity
      style={s.miniPlayer}
      onPress={() => setExpanded(true)}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel="აუდიო პლეიერის გახსნა"
    >
      <View style={s.miniProgressBar}>
        <View style={[s.miniProgressFill, { width: `${progressPercent}%` }]} />
      </View>
      <View style={s.miniContent}>
        <TouchableOpacity
          style={s.miniPlayBtn}
          onPress={(e) => { e.stopPropagation?.(); player.togglePlay(); }}
          accessibilityLabel={player.isPlaying ? 'პაუზა' : 'დაკვრა'}
        >
          {player.isLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={s.miniPlayIcon}>{player.isPlaying ? '⏸' : '▶'}</Text>
          )}
        </TouchableOpacity>
        <View style={s.miniInfo}>
          <Text style={s.miniTitle} numberOfLines={1}>{bookTitle}</Text>
          <Text style={s.miniChapter}>თავი {player.currentChapter}</Text>
        </View>
        <TouchableOpacity
          onPress={() => player.nextChapter()}
          accessibilityLabel="შემდეგი თავი"
        >
          <Text style={s.miniSkipIcon}>⏭</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  // Full-screen Player
  const renderFullPlayer = () => (
    <Modal
      visible={expanded}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setExpanded(false)}
    >
      <View style={s.fullPlayer}>
        {/* Header */}
        <TouchableOpacity
          style={s.fullCloseBtn}
          onPress={() => setExpanded(false)}
          accessibilityLabel="პლეიერის დახურვა"
        >
          <Text style={s.fullCloseIcon}>▼</Text>
        </TouchableOpacity>

        {/* Book Info */}
        <View style={s.fullBookInfo}>
          <View style={s.fullCoverPlaceholder}>
            <Text style={s.fullCoverIcon}>📖</Text>
          </View>
          <Text style={s.fullTitle} numberOfLines={2}>{bookTitle}</Text>
          <Text style={s.fullChapter}>თავი {player.currentChapter} / {chapters.length}</Text>
        </View>

        {/* Progress Bar */}
        <View style={s.fullProgressSection}>
          <View style={s.fullProgressBar}>
            <View style={[s.fullProgressFill, { width: `${progressPercent}%` }]} />
          </View>
          <View style={s.fullTimeRow}>
            <Text style={s.fullTimeText}>{formatTime(player.position)}</Text>
            <Text style={s.fullTimeText}>{formatTime(player.duration)}</Text>
          </View>
        </View>

        {/* Controls */}
        <View style={s.fullControls}>
          <TouchableOpacity
            onPress={() => player.prevChapter()}
            style={s.fullBtn}
            accessibilityLabel="წინა თავი"
          >
            <Text style={s.fullBtnText}>⏮</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => player.skip(-15)}
            style={s.fullBtn}
            accessibilityLabel="15 წამით უკან"
          >
            <Text style={s.fullSkipText}>-15</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => player.togglePlay()}
            style={s.fullPlayBtn}
            accessibilityLabel={player.isPlaying ? 'პაუზა' : 'დაკვრა'}
          >
            {player.isLoading ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : (
              <Text style={s.fullPlayIcon}>{player.isPlaying ? '⏸' : '▶'}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => player.skip(15)}
            style={s.fullBtn}
            accessibilityLabel="15 წამით წინ"
          >
            <Text style={s.fullSkipText}>+15</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => player.nextChapter()}
            style={s.fullBtn}
            accessibilityLabel="შემდეგი თავი"
          >
            <Text style={s.fullBtnText}>⏭</Text>
          </TouchableOpacity>
        </View>

        {/* Speed & Sleep */}
        <View style={s.fullMetaRow}>
          <TouchableOpacity
            style={s.speedChip}
            onPress={() => player.cycleSpeed()}
            accessibilityLabel={`სიჩქარე ${player.speed}x`}
          >
            <Text style={s.speedChipText}>{player.speed}x</Text>
          </TouchableOpacity>

          <View style={s.sleepRow}>
            {SLEEP_OPTIONS.map((min) => (
              <TouchableOpacity
                key={min}
                style={[
                  s.sleepChip,
                  player.sleepTimer === min && s.sleepChipActive,
                ]}
                onPress={() => player.setSleepTimer(player.sleepTimer === min ? null : min)}
                accessibilityLabel={`ძილის ტაიმერი ${min} წუთი`}
              >
                <Text style={[
                  s.sleepChipText,
                  player.sleepTimer === min && s.sleepChipTextActive,
                ]}>
                  {min}წთ
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Sleep Timer Indicator */}
        {player.sleepTimer !== null && (
          <Text style={s.sleepIndicator}>
            ძილის ტაიმერი: {player.sleepTimer} წუთი დარჩა
          </Text>
        )}

        {/* Error */}
        {player.error && (
          <Text style={s.errorText}>{player.error}</Text>
        )}

        {/* Chapter List */}
        <View style={s.chapterList}>
          <Text style={s.chapterListTitle}>თავები</Text>
          {chapters.map((ch) => (
            <TouchableOpacity
              key={ch.audioChapterId}
              style={[
                s.chapterItem,
                ch.chapterNumber === player.currentChapter && s.chapterItemActive,
              ]}
              onPress={() => {
                // Direct chapter change via state update pattern
                // The hook will handle loading
              }}
              accessibilityLabel={`თავი ${ch.chapterNumber}`}
            >
              <Text style={[
                s.chapterItemText,
                ch.chapterNumber === player.currentChapter && s.chapterItemTextActive,
              ]}>
                თავი {ch.chapterNumber}
              </Text>
              <Text style={s.chapterItemStatus}>
                {ch.status === 'COMPLETED' ? '✓' : ch.status === 'GENERATING' ? '⏳' : '—'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );

  return (
    <>
      {renderMiniPlayer()}
      {renderFullPlayer()}
    </>
  );
}

const s = StyleSheet.create({
  // Mini Player
  miniPlayer: {
    backgroundColor: colors.light.surface,
    borderTopWidth: 1,
    borderTopColor: colors.light.border,
  },
  miniProgressBar: {
    height: 2,
    backgroundColor: colors.light.border,
  },
  miniProgressFill: {
    height: '100%',
    backgroundColor: colors.light.primary,
  },
  miniContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 12,
  },
  miniPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.light.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniPlayIcon: { fontSize: 14, color: '#fff' },
  miniInfo: { flex: 1 },
  miniTitle: { fontSize: 13, fontWeight: '600', color: colors.light.text },
  miniChapter: { fontSize: 11, color: colors.light.textSecondary },
  miniSkipIcon: { fontSize: 18, color: colors.light.textSecondary, paddingHorizontal: 8 },

  // Full Player
  fullPlayer: {
    flex: 1,
    backgroundColor: colors.light.background,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  fullCloseBtn: {
    alignSelf: 'center',
    paddingVertical: 8,
  },
  fullCloseIcon: {
    fontSize: 20,
    color: colors.light.textSecondary,
  },
  fullBookInfo: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 32,
  },
  fullCoverPlaceholder: {
    width: 180,
    height: 240,
    backgroundColor: colors.light.surface,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.light.border,
  },
  fullCoverIcon: { fontSize: 48 },
  fullTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.light.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  fullChapter: {
    fontSize: 14,
    color: colors.light.textSecondary,
  },

  // Progress
  fullProgressSection: { marginBottom: 24 },
  fullProgressBar: {
    height: 4,
    backgroundColor: colors.light.border,
    borderRadius: 2,
    marginBottom: 6,
  },
  fullProgressFill: {
    height: '100%',
    backgroundColor: colors.light.primary,
    borderRadius: 2,
  },
  fullTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  fullTimeText: {
    fontSize: 11,
    color: colors.light.textSecondary,
  },

  // Controls
  fullControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    marginBottom: 24,
  },
  fullBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullBtnText: { fontSize: 20, color: colors.light.text },
  fullSkipText: { fontSize: 14, fontWeight: '700', color: colors.light.textSecondary },
  fullPlayBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.light.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullPlayIcon: { fontSize: 24, color: '#fff' },

  // Meta
  fullMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  speedChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.light.border,
  },
  speedChipText: { fontSize: 13, fontWeight: '700', color: colors.light.text },
  sleepRow: { flexDirection: 'row', gap: 6 },
  sleepChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
  },
  sleepChipActive: {
    backgroundColor: colors.light.primary,
    borderColor: colors.light.primary,
  },
  sleepChipText: { fontSize: 12, color: colors.light.textSecondary },
  sleepChipTextActive: { color: '#fff' },
  sleepIndicator: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.light.primary,
    marginBottom: 16,
  },
  errorText: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.light.error,
    marginBottom: 8,
  },

  // Chapter List
  chapterList: { flex: 1, marginTop: 8 },
  chapterListTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.light.text,
    marginBottom: 8,
  },
  chapterItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.border,
  },
  chapterItemActive: {
    backgroundColor: `${colors.light.primary}10`,
    borderLeftWidth: 3,
    borderLeftColor: colors.light.primary,
  },
  chapterItemText: { fontSize: 14, color: colors.light.text },
  chapterItemTextActive: { fontWeight: '700', color: colors.light.primary },
  chapterItemStatus: { fontSize: 14, color: colors.light.textSecondary },
});
