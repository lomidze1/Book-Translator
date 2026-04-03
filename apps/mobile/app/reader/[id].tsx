import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, SafeAreaView, Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiRequest } from '@/services/api';
import { authService } from '@/services/auth';
import { colors } from '@/theme/colors';

interface TranslatedChapter {
  id: string;
  translatedContent: string;
  chapter: { number: number; title?: string };
}

interface TranslationData {
  id: string;
  book: { id: string; title: string; author?: string };
  translatedChapters: TranslatedChapter[];
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function MobileReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [translation, setTranslation] = useState<TranslationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [percentage, setPercentage] = useState(0);
  const [activeChapter, setActiveChapter] = useState(1);
  const [fontSize, setFontSize] = useState(18);
  const [showControls, setShowControls] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const t = await authService.getToken();
      if (!t) { setError('გთხოვთ შეხვიდეთ'); setLoading(false); return; }
      setToken(t);

      try {
        const translations = await apiRequest<any[]>(`/translations/book/${id}`);
        const completed = translations.find((tr) => tr.status === 'COMPLETED');
        if (!completed) { setError('თარგმანი ჯერ მზად არ არის'); setLoading(false); return; }

        const full = await apiRequest<TranslationData>(`/translations/${completed.id}`);
        setTranslation(full);
      } catch {
        setError('შეცდომა მონაცემების ჩატვირთვისას');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleScroll = useCallback((e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const scrollHeight = contentSize.height - layoutMeasurement.height;
    if (scrollHeight > 0) {
      const pct = Math.round((contentOffset.y / scrollHeight) * 100);
      setPercentage(pct);
      // Estimate active chapter from scroll position
      if (translation) {
        const totalChapters = translation.translatedChapters.length;
        const estimatedChapter = Math.max(1, Math.min(totalChapters, Math.ceil((pct / 100) * totalChapters)));
        setActiveChapter(estimatedChapter);
      }
    }
  }, [translation]);

  // Save progress via reader API
  useEffect(() => {
    if (!token || !translation || percentage === 0) return;
    const timer = setTimeout(() => {
      fetch(`${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000'}/api/reader/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          bookId: translation.book.id,
          currentChapter: activeChapter,
          currentPosition: 0,
          percentage,
        }),
      }).catch(() => {});
    }, 5000);
    return () => clearTimeout(timer);
  }, [percentage, token, translation]);

  if (loading) {
    return <View style={s.center}><Text style={s.loadingText}>იტვირთება...</Text></View>;
  }

  if (error || !translation) {
    return (
      <SafeAreaView style={s.center}>
        <Text style={s.errorText}>{error}</Text>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backBtnText}>უკან</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const chapters = [...translation.translatedChapters].sort(
    (a, b) => a.chapter.number - b.chapter.number
  );

  return (
    <SafeAreaView style={s.container}>
      {/* Top bar */}
      {showControls && (
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={s.topBarBtn}>&#8592; უკან</Text>
          </TouchableOpacity>
          <Text style={s.topBarTitle} numberOfLines={1}>{translation.book.title}</Text>
          <View style={s.fontControls}>
            <TouchableOpacity onPress={() => setFontSize((s) => Math.max(14, s - 2))}>
              <Text style={s.fontBtn}>A-</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setFontSize((s) => Math.min(28, s + 2))}>
              <Text style={s.fontBtn}>A+</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={s.scrollView}
        contentContainerStyle={s.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        onTouchStart={() => setShowControls(!showControls)}
      >
        {chapters.map((ch) => (
          <View key={ch.id} style={s.chapter}>
            <Text style={s.chapterTitle}>
              {ch.chapter.title || `თავი ${ch.chapter.number}`}
            </Text>
            <Text style={[s.chapterText, { fontSize }]}>
              {ch.translatedContent}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* Bottom progress */}
      {showControls && (
        <View style={s.bottomBar}>
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${percentage}%` }]} />
          </View>
          <Text style={s.progressText}>{percentage}%</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  loadingText: { fontSize: 16, color: colors.light.textSecondary },
  errorText: { fontSize: 16, color: colors.light.error, marginBottom: 16 },
  backBtn: { backgroundColor: colors.light.primary, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24 },
  backBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.light.border, backgroundColor: '#fff',
  },
  topBarBtn: { fontSize: 16, color: colors.light.primary, fontWeight: '500' },
  topBarTitle: { flex: 1, fontSize: 15, fontWeight: '500', textAlign: 'center', marginHorizontal: 8, color: colors.light.text },
  fontControls: { flexDirection: 'row', gap: 12 },
  fontBtn: { fontSize: 16, color: colors.light.primary, fontWeight: '600' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20 },
  chapter: { marginBottom: 48 },
  chapterTitle: { fontSize: 22, fontWeight: '700', color: colors.light.text, marginBottom: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.light.border },
  chapterText: { lineHeight: 32, color: colors.light.text },
  bottomBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.light.border },
  progressBar: { flex: 1, height: 4, backgroundColor: colors.light.border, borderRadius: 2, marginRight: 12 },
  progressFill: { height: '100%', backgroundColor: colors.light.primary, borderRadius: 2 },
  progressText: { fontSize: 13, color: colors.light.textSecondary, width: 36 },
});
