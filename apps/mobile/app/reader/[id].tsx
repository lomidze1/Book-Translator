import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, SafeAreaView,
  useWindowDimensions, Modal, TextInput, FlatList, ActivityIndicator,
} from 'react-native';
import {
  resolveHighlightRanges, segmentChapterText, selectionToChapterRange,
  type TextSegment,
} from '@book-translator/reader';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiRequest } from '@/services/api';
import { authService } from '@/services/auth';
import { bookCacheService } from '@/services/book-cache';
import { useTheme } from '@/theme/ThemeContext';
import { useTranslation } from '@/i18n/useTranslation';
import { useToast } from '@/context/ToastContext';
// Rendered again inside each Modal below: a native Modal lives in its own window
// above the root view, so the app-level ToastContainer is invisible while a sheet
// is open and toasts fired from inside one would never be seen.
import ToastContainer from '@/components/common/Toast';
import ColorPicker, { HIGHLIGHT_HEX, type HighlightColor } from '@/components/reader/ColorPicker';
import SelectableChapterText from '@/components/reader/SelectableChapterText';
import { API_URL } from '@/config';

// ── Types ──

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

interface BookmarkItem {
  id: string;
  chapterNumber: number;
  position: number;
  label?: string;
  createdAt: string;
}

interface NoteItem {
  id: string;
  chapterNumber: number;
  content: string;
  createdAt: string;
}

interface HighlightItem {
  id: string;
  chapterNumber: number;
  startPosition: number;
  endPosition: number;
  selectedText: string;
  color: string;
  createdAt: string;
}

/** A live text selection, already in chapter-text coordinates. */
interface SelectionState {
  chapterNumber: number;
  start: number;
  end: number;
  text: string;
}

interface ReaderSettings {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  theme: string;
}

const DEFAULT_SETTINGS: ReaderSettings = {
  fontFamily: 'default', fontSize: 18, lineHeight: 1.8, theme: 'light',
};

const READER_SETTINGS_KEY = 'reader-settings';
const READER_THEMES: Record<
  string,
  { background: string; text: string; textSecondary: string; border: string }
> = {
  light: { background: '#ffffff', text: '#1a1a1a', textSecondary: '#6b7280', border: '#e5e7eb' },
  sepia: { background: '#f4ecd8', text: '#5c4b37', textSecondary: '#8a7a63', border: '#e0d5bb' },
  dark: { background: '#1a1a1a', text: '#e0e0e0', textSecondary: '#9ca3af', border: '#3a3a3a' },
};

const FONT_MAP: Record<string, string | undefined> = {
  default: undefined,
  serif: 'serif',
  'sans-serif': 'sans-serif',
  bpg: undefined, // BPG not bundled on mobile — fallback to default
};

export default function MobileReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme, isDark, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { height: screenHeight } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const isScrolling = useRef(false);

  const [translation, setTranslation] = useState<TranslationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [percentage, setPercentage] = useState(0);
  const [activeChapter, setActiveChapter] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [isOfflineCached, setIsOfflineCached] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Reader settings
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

  // Bookmarks
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);

  // Notes
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [showNotes, setShowNotes] = useState(false);
  const [noteText, setNoteText] = useState('');

  // Highlights
  const [highlights, setHighlights] = useState<HighlightItem[]>([]);
  const [showHighlights, setShowHighlights] = useState(false);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  // The input that owns the live selection, so it can be cleared after saving.
  const selectedInput = useRef<TextInput | null>(null);

  const bookId = translation?.book.id;

  // Chapters sorted once; everything below indexes into them by chapter number.
  const chapters = useMemo(
    () => [...(translation?.translatedChapters ?? [])].sort(
      (a, b) => a.chapter.number - b.chapter.number,
    ),
    [translation],
  );

  const chapterTexts = useMemo(() => {
    const map = new Map<number, string>();
    for (const ch of chapters) map.set(ch.chapter.number, ch.translatedContent);
    return map;
  }, [chapters]);

  // Stored highlights → coloured runs of chapter text, ready to render.
  const chapterSegments = useMemo(() => {
    const map = new Map<number, TextSegment[]>();
    for (const ch of chapters) {
      const ranges = resolveHighlightRanges(
        ch.translatedContent,
        highlights.filter((h) => h.chapterNumber === ch.chapter.number),
      );
      map.set(ch.chapter.number, segmentChapterText(ch.translatedContent, ranges));
    }
    return map;
  }, [chapters, highlights]);

  // ── Load reader settings ──
  useEffect(() => {
    AsyncStorage.getItem(READER_SETTINGS_KEY).then((raw) => {
      if (raw) {
        // Corrupt stored JSON just falls back to defaults, but log it —
        // silently ignoring makes "my settings keep resetting" undebuggable.
        try {
          setReaderSettings(JSON.parse(raw));
        } catch (err) {
          console.warn('[reader] discarding corrupt reader settings:', err);
        }
      }
    });
  }, []);

  const updateReaderSetting = useCallback(<K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
    setReaderSettings((prev) => {
      const updated = { ...prev, [key]: value };
      AsyncStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // ── Load translation (API with offline fallback) ──
  useEffect(() => {
    async function load() {
      const tkn = await authService.getToken();
      if (!tkn) { setError(t('reader.login_required')); setLoading(false); return; }
      setToken(tkn);

      try {
        const translations = await apiRequest<any[]>(`/translations/book/${id}`);
        const completed = translations.find((tr: any) => tr.status === 'COMPLETED');
        if (!completed) { setError(t('reader.not_ready')); setLoading(false); return; }

        // Check offline cache status
        bookCacheService.isCached(completed.id).then(setIsOfflineCached);

        const full = await apiRequest<TranslationData>(`/translations/${completed.id}`);

        // Store book metadata for offline matching
        AsyncStorage.setItem(`book_meta_${completed.id}`, JSON.stringify({ bookId: id })).catch(() => {});
        setTranslation(full);
      } catch {
        // Try offline cache for this specific book
        try {
          const keys = await AsyncStorage.getAllKeys();
          const cacheKeys = keys.filter((k) => k.startsWith('book_cache_') && k !== 'book_cache_index');
          for (const key of cacheKeys) {
            const translationId = key.replace('book_cache_', '');
            const cached = await bookCacheService.getCachedTranslation(translationId);
            if (cached && cached.length > 0) {
              // Verify this cache belongs to the requested book by checking stored metadata
              const metaRaw = await AsyncStorage.getItem(`book_meta_${translationId}`);
              if (metaRaw) {
                const meta = JSON.parse(metaRaw);
                if (meta.bookId !== id) continue;
              }
              setTranslation({
                id: translationId,
                book: { id: id!, title: '', author: undefined },
                translatedChapters: cached,
              });
              setIsOfflineCached(true);
              setLoading(false);
              return;
            }
          }
        } catch (cacheErr) {
          // Cache lookup failed too — the user still gets load_error, but
          // without this the real reason never surfaces anywhere.
          console.warn('[reader] offline cache fallback failed:', cacheErr);
        }
        setError(t('reader.load_error'));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, t]);

  // ── Load bookmarks, notes, highlights ──
  useEffect(() => {
    if (!token || !bookId) return;
    apiRequest<BookmarkItem[]>(`/reader/bookmarks/${bookId}`)
      .then(setBookmarks).catch(() => {});
    apiRequest<NoteItem[]>(`/reader/notes/${bookId}`)
      .then(setNotes).catch(() => {});
    apiRequest<HighlightItem[]>(`/reader/highlights/${bookId}`)
      .then(setHighlights).catch(() => {});
  }, [token, bookId]);

  // ── Scroll tracking ──
  const handleScroll = useCallback((e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const scrollHeight = contentSize.height - layoutMeasurement.height;
    if (scrollHeight > 0) {
      const pct = Math.round((contentOffset.y / scrollHeight) * 100);
      setPercentage(pct);
      if (translation) {
        const totalChapters = translation.translatedChapters.length;
        const estimatedChapter = Math.max(1, Math.min(totalChapters, Math.ceil((pct / 100) * totalChapters)));
        setActiveChapter(estimatedChapter);
      }
    }
  }, [translation]);

  // ── Save progress (debounced) ──
  useEffect(() => {
    if (!token || !translation || percentage === 0) return;
    const timer = setTimeout(() => {
      fetch(`${API_URL}/api/reader/progress`, {
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
  }, [percentage, activeChapter, token, translation]);

  // ── Bookmark toggle ──
  const toggleBookmark = async () => {
    if (!bookId) return;
    const existing = bookmarks.find((b) => b.chapterNumber === activeChapter);
    if (existing) {
      try {
        await apiRequest(`/reader/bookmarks/${existing.id}`, { method: 'DELETE' });
        setBookmarks((prev) => prev.filter((b) => b.id !== existing.id));
      } catch (err: any) {
        // Dropping it from local state on failure would make it reappear on
        // the next load, so keep the row and tell the user.
        showToast(err?.message || t('common.error'), 'error');
      }
    } else {
      try {
        const created = await apiRequest<BookmarkItem>('/reader/bookmarks', {
          method: 'POST',
          body: JSON.stringify({ bookId, chapterNumber: activeChapter, position: 0 }),
        });
        setBookmarks((prev) => [...prev, created]);
      } catch (err: any) {
        showToast(err?.message || t('common.error'), 'error');
      }
    }
  };
  const isChapterBookmarked = bookmarks.some((b) => b.chapterNumber === activeChapter);

  // ── Notes ──
  const handleAddNote = async () => {
    if (!bookId || !noteText.trim()) return;
    try {
      const created = await apiRequest<NoteItem>('/reader/notes', {
        method: 'POST',
        body: JSON.stringify({ bookId, chapterNumber: activeChapter, content: noteText.trim() }),
      });
      setNotes((prev) => [...prev, created]);
      setNoteText('');
    } catch (err: any) {
      showToast(err?.message || t('common.error'), 'error');
    }
  };

  const deleteNote = async (noteId: string) => {
    try {
      await apiRequest(`/reader/notes/${noteId}`, { method: 'DELETE' });
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (err: any) {
      showToast(err?.message || t('common.error'), 'error');
    }
  };

  // ── Highlights ──
  // The chapter text is one selectable input, so the offsets the platform
  // reports are already offsets into `translatedContent` — the same coordinate
  // space the web reader stores, which is what keeps a highlight on the same
  // words across devices.
  const handleSelect = useCallback((
    chapterNumber: number,
    start: number,
    end: number,
    input: TextInput | null,
  ) => {
    const chapterText = chapterTexts.get(chapterNumber);
    if (!chapterText) return;
    const range = selectionToChapterRange(chapterText, start, end);
    selectedInput.current = range ? input : null;
    setSelection(range ? { chapterNumber, ...range } : null);
  }, [chapterTexts]);

  const clearSelection = useCallback(() => {
    selectedInput.current?.blur();
    selectedInput.current = null;
    setSelection(null);
  }, []);

  const addHighlight = async (color: HighlightColor) => {
    if (!bookId || !selection) return;
    try {
      const created = await apiRequest<HighlightItem>('/reader/highlights', {
        method: 'POST',
        body: JSON.stringify({
          bookId,
          chapterNumber: selection.chapterNumber,
          startPosition: selection.start,
          endPosition: selection.end,
          selectedText: selection.text,
          color,
        }),
      });
      setHighlights((prev) => [...prev, created]);
      clearSelection();
      showToast(t('reader.highlight_saved'), 'success');
    } catch (err: any) {
      showToast(err?.message || t('common.error'), 'error');
    }
  };

  const updateHighlightColor = async (highlightId: string, color: HighlightColor) => {
    try {
      await apiRequest(`/reader/highlights/${highlightId}`, {
        method: 'PATCH',
        body: JSON.stringify({ color }),
      });
      setHighlights((prev) =>
        prev.map((h) => (h.id === highlightId ? { ...h, color } : h))
      );
    } catch (err: any) {
      showToast(err?.message || t('common.error'), 'error');
    }
  };

  const deleteHighlight = async (highlightId: string) => {
    try {
      await apiRequest(`/reader/highlights/${highlightId}`, { method: 'DELETE' });
      setHighlights((prev) => prev.filter((h) => h.id !== highlightId));
    } catch (err: any) {
      showToast(err?.message || t('common.error'), 'error');
    }
  };

  // ── Offline download ──
  const handleDownloadOffline = async () => {
    if (!translation) return;
    setDownloading(true);
    try {
      await bookCacheService.cacheTranslation(translation.id, translation.translatedChapters);
      setIsOfflineCached(true);
      showToast(t('reader.offline_available'), 'success');
    } catch {
      showToast(t('common.error'), 'error');
    } finally {
      setDownloading(false);
    }
  };

  // ── Reader theme ──
  const readerTheme = READER_THEMES[readerSettings.theme] || READER_THEMES.light;
  const fontFamily = FONT_MAP[readerSettings.fontFamily];

  // ── Loading / Error states ──
  if (loading) {
    return (
      <SafeAreaView style={[s.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </SafeAreaView>
    );
  }

  if (error || !translation) {
    return (
      <SafeAreaView style={[s.center, { backgroundColor: theme.background }]}>
        <Text style={[s.errorText, { color: theme.error }]}>{error}</Text>
        <TouchableOpacity style={[s.backBtn, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
          <Text style={s.backBtnText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const fontLabels: Record<string, string> = {
    default: t('reader.font_default'),
    serif: t('reader.font_serif'),
    'sans-serif': t('reader.font_sans'),
    bpg: t('reader.font_bpg'),
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: readerTheme.background }]}>
      {/* ── Top bar ── */}
      {showControls && (
        <View style={[s.topBar, { borderBottomColor: theme.border, backgroundColor: readerTheme.background }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[s.topBarBtn, { color: theme.primary }]}>&#8592; {t('common.back')}</Text>
          </TouchableOpacity>
          <Text style={[s.topBarTitle, { color: readerTheme.text }]} numberOfLines={1}>
            {translation.book.title}
          </Text>
          <View style={s.topBarRight}>
            <TouchableOpacity onPress={toggleBookmark}>
              <Text style={[s.toolBtn, { color: isChapterBookmarked ? '#facc15' : theme.textSecondary }]}>
                {isChapterBookmarked ? '★' : '☆'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowHighlights(true)}>
              <Text style={[s.toolBtn, { color: theme.textSecondary }]}>🖍</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowNotes(true)}>
              <Text style={[s.toolBtn, { color: theme.textSecondary }]}>📝</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowBookmarks(true)}>
              <Text style={[s.toolBtn, { color: theme.textSecondary }]}>🔖</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowSettingsPanel(true)}>
              <Text style={[s.toolBtn, { color: theme.textSecondary }]}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Content ── */}
      <ScrollView
        ref={scrollRef}
        style={s.scrollView}
        contentContainerStyle={s.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        onScrollBeginDrag={() => { isScrolling.current = true; }}
        onScrollEndDrag={() => { isScrolling.current = false; }}
        onTouchEnd={() => {
          // A long press that selected text shouldn't also toggle the chrome.
          if (!isScrolling.current && !selection) setShowControls((prev) => !prev);
        }}
      >
        {chapters.map((ch) => (
          <View key={ch.id} style={s.chapter}>
            <Text style={[s.chapterTitle, { color: readerTheme.text, borderBottomColor: theme.border }]}>
              {ch.chapter.title || t('reader.chapter', { number: ch.chapter.number })}
            </Text>
            <SelectableChapterText
              chapterNumber={ch.chapter.number}
              segments={chapterSegments.get(ch.chapter.number) || []}
              onSelect={handleSelect}
              style={{
                fontSize: readerSettings.fontSize,
                lineHeight: readerSettings.fontSize * readerSettings.lineHeight,
                color: readerTheme.text,
                ...(fontFamily ? { fontFamily } : {}),
              }}
            />
          </View>
        ))}
      </ScrollView>

      {/* ── Selection toolbar ── */}
      {selection && (
        <View
          style={[
            s.selectionBar,
            { backgroundColor: theme.surface, borderColor: theme.border, bottom: showControls ? 60 : 16 },
          ]}
        >
          <Text style={[s.selectionText, { color: theme.textSecondary }]} numberOfLines={1}>
            {selection.text}
          </Text>
          <View style={s.selectionActions}>
            <ColorPicker onSelect={addHighlight} />
            <TouchableOpacity onPress={clearSelection}>
              <Text style={[s.modalClose, { color: theme.primary }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Bottom progress ── */}
      {showControls && (
        <View style={[s.bottomBar, { borderTopColor: theme.border, backgroundColor: readerTheme.background }]}>
          {/* Offline indicator */}
          {isOfflineCached && (
            <Text style={[s.offlineBadge, { color: '#22c55e' }]}>✓</Text>
          )}
          {!isOfflineCached && !downloading && (
            <TouchableOpacity onPress={handleDownloadOffline} style={s.downloadBtn}>
              <Text style={[s.downloadText, { color: theme.primary }]}>↓</Text>
            </TouchableOpacity>
          )}
          {downloading && <ActivityIndicator size="small" color={theme.primary} style={s.downloadBtn} />}

          <View style={[s.progressBar, { backgroundColor: theme.border }]}>
            <View style={[s.progressFill, { width: `${percentage}%`, backgroundColor: theme.primary }]} />
          </View>
          <Text style={[s.progressText, { color: theme.textSecondary }]}>{percentage}%</Text>
        </View>
      )}

      {/* ── Settings Panel Modal ── */}
      <Modal visible={showSettingsPanel} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: readerTheme.background, maxHeight: screenHeight * 0.7 }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: readerTheme.text }]}>{t('reader.settings_panel')}</Text>
              <TouchableOpacity onPress={() => setShowSettingsPanel(false)}>
                <Text style={[s.modalClose, { color: theme.primary }]}>{t('common.close')}</Text>
              </TouchableOpacity>
            </View>

            {/* Font Size */}
            <View style={s.settingRow}>
              <Text style={[s.settingLabel, { color: readerTheme.textSecondary }]}>{t('settings.font_size')}</Text>
              <View style={s.stepperRow}>
                <TouchableOpacity style={[s.stepBtn, { borderColor: readerTheme.border }]}
                  onPress={() => updateReaderSetting('fontSize', Math.max(14, readerSettings.fontSize - 2))}>
                  <Text style={[s.stepText, { color: theme.primary }]}>A-</Text>
                </TouchableOpacity>
                <Text style={[s.stepValue, { color: readerTheme.text }]}>{readerSettings.fontSize}</Text>
                <TouchableOpacity style={[s.stepBtn, { borderColor: readerTheme.border }]}
                  onPress={() => updateReaderSetting('fontSize', Math.min(28, readerSettings.fontSize + 2))}>
                  <Text style={[s.stepText, { color: theme.primary }]}>A+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Font Family */}
            <Text style={[s.settingLabel, { color: readerTheme.textSecondary }]}>{t('settings.font_family')}</Text>
            <View style={s.chipRow}>
              {Object.entries(fontLabels).map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[s.chip, readerSettings.fontFamily === key && { backgroundColor: theme.primary }]}
                  onPress={() => updateReaderSetting('fontFamily', key)}
                >
                  <Text style={{ fontSize: 12, color: readerSettings.fontFamily === key ? '#fff' : readerTheme.text }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Line Height */}
            <View style={s.settingRow}>
              <Text style={[s.settingLabel, { color: readerTheme.textSecondary }]}>{t('settings.line_height')}</Text>
              <View style={s.stepperRow}>
                <TouchableOpacity style={[s.stepBtn, { borderColor: readerTheme.border }]}
                  onPress={() => updateReaderSetting('lineHeight', Math.max(1.4, +(readerSettings.lineHeight - 0.2).toFixed(1)))}>
                  <Text style={[s.stepText, { color: theme.primary }]}>-</Text>
                </TouchableOpacity>
                <Text style={[s.stepValue, { color: readerTheme.text }]}>{readerSettings.lineHeight.toFixed(1)}</Text>
                <TouchableOpacity style={[s.stepBtn, { borderColor: readerTheme.border }]}
                  onPress={() => updateReaderSetting('lineHeight', Math.min(2.2, +(readerSettings.lineHeight + 0.2).toFixed(1)))}>
                  <Text style={[s.stepText, { color: theme.primary }]}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Reader Theme */}
            <Text style={[s.settingLabel, { color: readerTheme.textSecondary }]}>{t('settings.reader_theme')}</Text>
            <View style={s.chipRow}>
              {[
                { key: 'light', label: t('settings.theme_light'), bg: '#fff', fg: '#1a1a1a' },
                { key: 'sepia', label: t('settings.theme_sepia'), bg: '#f4ecd8', fg: '#5c4b37' },
                { key: 'dark', label: t('settings.theme_dark'), bg: '#1a1a1a', fg: '#e0e0e0' },
              ].map((rt) => (
                <TouchableOpacity
                  key={rt.key}
                  style={[
                    s.themeChip,
                    { backgroundColor: rt.bg, borderColor: readerSettings.theme === rt.key ? theme.primary : readerTheme.border },
                  ]}
                  onPress={() => updateReaderSetting('theme', rt.key)}
                >
                  <Text style={{ color: rt.fg, fontSize: 12 }}>{rt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
        <ToastContainer />
      </Modal>

      {/* ── Highlights Modal ── */}
      <Modal visible={showHighlights} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: readerTheme.background, maxHeight: screenHeight * 0.7 }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: readerTheme.text }]}>{t('reader.highlights')}</Text>
              <TouchableOpacity onPress={() => setShowHighlights(false)}>
                <Text style={[s.modalClose, { color: theme.primary }]}>{t('common.close')}</Text>
              </TouchableOpacity>
            </View>

            <Text style={[s.settingLabel, { color: readerTheme.textSecondary }]}>
              {t('reader.highlight_hint')}
            </Text>

            {highlights.length === 0 ? (
              <Text style={[s.emptyText, { color: readerTheme.textSecondary }]}>{t('reader.highlights_empty')}</Text>
            ) : (
              <FlatList
                data={highlights}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={[s.highlightCard, { borderColor: readerTheme.border, borderLeftColor: HIGHLIGHT_HEX[item.color as HighlightColor] || '#facc15' }]}>
                    <View style={s.highlightHeader}>
                      <Text style={[s.noteChapter, { color: readerTheme.textSecondary }]}>
                        {t('reader.chapter', { number: item.chapterNumber })}
                      </Text>
                      <View style={s.highlightActions}>
                        <ColorPicker
                          selected={item.color as HighlightColor}
                          onSelect={(c) => updateHighlightColor(item.id, c)}
                        />
                        <TouchableOpacity onPress={() => deleteHighlight(item.id)}>
                          <Text style={[s.deleteBtn, { color: theme.error }]}>{t('common.delete')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <Text style={[s.highlightText, { color: readerTheme.text }]} numberOfLines={2}>
                      {item.selectedText}
                    </Text>
                  </View>
                )}
              />
            )}
          </View>
        </View>
        <ToastContainer />
      </Modal>

      {/* ── Bookmarks Modal ── */}
      <Modal visible={showBookmarks} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: readerTheme.background, maxHeight: screenHeight * 0.7 }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: readerTheme.text }]}>{t('reader.bookmarks')}</Text>
              <TouchableOpacity onPress={() => setShowBookmarks(false)}>
                <Text style={[s.modalClose, { color: theme.primary }]}>{t('common.close')}</Text>
              </TouchableOpacity>
            </View>
            {bookmarks.length === 0 ? (
              <Text style={[s.emptyText, { color: readerTheme.textSecondary }]}>{t('reader.bookmarks_empty')}</Text>
            ) : (
              <FlatList
                data={bookmarks}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[s.listItem, { borderBottomColor: readerTheme.border }]}
                    onPress={() => { setShowBookmarks(false); setActiveChapter(item.chapterNumber); }}
                  >
                    <Text style={[s.listItemText, { color: readerTheme.text }]}>
                      {t('reader.chapter', { number: item.chapterNumber })}
                    </Text>
                    <Text style={[s.listItemDate, { color: readerTheme.textSecondary }]}>
                      {new Date(item.createdAt).toLocaleDateString('ka-GE')}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
        <ToastContainer />
      </Modal>

      {/* ── Notes Modal ── */}
      <Modal visible={showNotes} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: readerTheme.background, maxHeight: screenHeight * 0.7 }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: readerTheme.text }]}>{t('reader.notes')}</Text>
              <TouchableOpacity onPress={() => setShowNotes(false)}>
                <Text style={[s.modalClose, { color: theme.primary }]}>{t('common.close')}</Text>
              </TouchableOpacity>
            </View>

            <View style={s.addNoteRow}>
              <TextInput
                style={[s.noteInput, { borderColor: readerTheme.border, color: readerTheme.text, backgroundColor: theme.surface }]}
                placeholder={t('reader.note_placeholder')}
                placeholderTextColor={readerTheme.textSecondary}
                value={noteText}
                onChangeText={setNoteText}
                multiline
              />
              <TouchableOpacity
                style={[s.addNoteBtn, { backgroundColor: theme.primary }]}
                onPress={handleAddNote}
                disabled={!noteText.trim()}
              >
                <Text style={s.addNoteBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            {notes.length === 0 ? (
              <Text style={[s.emptyText, { color: readerTheme.textSecondary }]}>{t('reader.notes_empty')}</Text>
            ) : (
              <FlatList
                data={notes}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={[s.noteCard, { borderColor: readerTheme.border, backgroundColor: theme.surface }]}>
                    <View style={s.noteHeader}>
                      <Text style={[s.noteChapter, { color: readerTheme.textSecondary }]}>
                        {t('reader.chapter', { number: item.chapterNumber })}
                      </Text>
                      <TouchableOpacity onPress={() => deleteNote(item.id)}>
                        <Text style={[s.deleteBtn, { color: theme.error }]}>{t('common.delete')}</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={[s.noteContent, { color: readerTheme.text }]}>{item.content}</Text>
                  </View>
                )}
              />
            )}
          </View>
        </View>
        <ToastContainer />
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, marginBottom: 16 },
  backBtn: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24 },
  backBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1,
  },
  topBarBtn: { fontSize: 16, fontWeight: '500' },
  topBarTitle: { flex: 1, fontSize: 14, fontWeight: '500', textAlign: 'center', marginHorizontal: 4 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toolBtn: { fontSize: 18 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20 },
  chapter: { marginBottom: 48 },
  chapterTitle: {
    fontSize: 22, fontWeight: '700', marginBottom: 16, paddingBottom: 8,
    borderBottomWidth: 1,
  },
  selectionBar: {
    position: 'absolute', left: 12, right: 12,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
  },
  selectionText: { fontSize: 13, marginBottom: 4 },
  selectionActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bottomBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8,
    borderTopWidth: 1,
  },
  offlineBadge: { fontSize: 14, fontWeight: '700', marginRight: 8 },
  downloadBtn: { marginRight: 8 },
  downloadText: { fontSize: 18, fontWeight: '700' },
  progressBar: { flex: 1, height: 4, borderRadius: 2, marginRight: 12, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  progressText: { fontSize: 13, width: 36 },
  // Settings panel
  settingRow: { marginBottom: 12 },
  settingLabel: { fontSize: 13, marginBottom: 6, marginTop: 4 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  stepText: { fontSize: 16, fontWeight: '600' },
  stepValue: { fontSize: 16, fontWeight: '500', width: 40, textAlign: 'center' },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.05)' },
  themeChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    borderWidth: 2, minWidth: 60, alignItems: 'center',
  },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalClose: { fontSize: 15, fontWeight: '500' },
  emptyText: { textAlign: 'center', paddingVertical: 24, fontSize: 15 },
  listItem: {
    paddingVertical: 14, borderBottomWidth: 1, flexDirection: 'row',
    justifyContent: 'space-between',
  },
  listItemText: { fontSize: 15, fontWeight: '500' },
  listItemDate: { fontSize: 13 },
  // Highlights
  highlightCard: {
    borderWidth: 1, borderLeftWidth: 4, borderRadius: 8, padding: 10, marginBottom: 8,
  },
  highlightHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
  },
  highlightActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  highlightText: { fontSize: 13, lineHeight: 18 },
  // Notes
  addNoteRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  noteInput: {
    flex: 1, borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14,
    minHeight: 44, maxHeight: 100,
  },
  addNoteBtn: {
    width: 44, height: 44, borderRadius: 8, justifyContent: 'center', alignItems: 'center',
  },
  addNoteBtnText: { color: '#fff', fontSize: 22, fontWeight: '600' },
  noteCard: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  noteHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  noteChapter: { fontSize: 12, fontWeight: '500' },
  deleteBtn: { fontSize: 13, fontWeight: '500' },
  noteContent: { fontSize: 14, lineHeight: 20 },
});
