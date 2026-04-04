import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, SafeAreaView,
  Dimensions, Modal, TextInput, FlatList, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiRequest } from '@/services/api';
import { authService } from '@/services/auth';
import { useTheme } from '@/theme/ThemeContext';

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

const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'red'] as const;
const HIGHLIGHT_HEX: Record<string, string> = {
  yellow: '#facc15', green: '#22c55e', blue: '#3b82f6', red: '#ef4444',
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function MobileReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme, isDark, toggleTheme } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [translation, setTranslation] = useState<TranslationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [percentage, setPercentage] = useState(0);
  const [activeChapter, setActiveChapter] = useState(1);
  const [fontSize, setFontSize] = useState(18);
  const [showControls, setShowControls] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  // Bookmarks state
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);

  // Notes state
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [showNotes, setShowNotes] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [editingNote, setEditingNote] = useState(false);

  const bookId = translation?.book.id;

  useEffect(() => {
    async function load() {
      const t = await authService.getToken();
      if (!t) { setError('გთხოვთ შეხვიდეთ'); setLoading(false); return; }
      setToken(t);

      try {
        const translations = await apiRequest<any[]>(`/translations/book/${id}`);
        const completed = translations.find((tr: any) => tr.status === 'COMPLETED');
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

  // Load bookmarks & notes
  useEffect(() => {
    if (!token || !bookId) return;
    apiRequest<BookmarkItem[]>(`/reader/bookmarks/${bookId}`)
      .then(setBookmarks).catch(() => {});
    apiRequest<NoteItem[]>(`/reader/notes/${bookId}`)
      .then(setNotes).catch(() => {});
  }, [token, bookId]);

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

  // Save progress
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

  // Bookmark toggle
  const toggleBookmark = async () => {
    if (!bookId) return;
    const existing = bookmarks.find((b) => b.chapterNumber === activeChapter);
    if (existing) {
      await apiRequest(`/reader/bookmarks/${existing.id}`, { method: 'DELETE' }).catch(() => {});
      setBookmarks((prev) => prev.filter((b) => b.id !== existing.id));
    } else {
      try {
        const created = await apiRequest<BookmarkItem>('/reader/bookmarks', {
          method: 'POST',
          body: JSON.stringify({ bookId, chapterNumber: activeChapter, position: 0 }),
        });
        setBookmarks((prev) => [...prev, created]);
      } catch {}
    }
  };

  const isChapterBookmarked = bookmarks.some((b) => b.chapterNumber === activeChapter);

  // Add note
  const handleAddNote = async () => {
    if (!bookId || !noteText.trim()) return;
    try {
      const created = await apiRequest<NoteItem>('/reader/notes', {
        method: 'POST',
        body: JSON.stringify({ bookId, chapterNumber: activeChapter, content: noteText.trim() }),
      });
      setNotes((prev) => [...prev, created]);
      setNoteText('');
      setEditingNote(false);
    } catch {}
  };

  const deleteNote = async (noteId: string) => {
    await apiRequest(`/reader/notes/${noteId}`, { method: 'DELETE' }).catch(() => {});
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  };

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
          <Text style={s.backBtnText}>უკან</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const chapters = [...translation.translatedChapters].sort(
    (a, b) => a.chapter.number - b.chapter.number,
  );

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.background }]}>
      {/* Top bar */}
      {showControls && (
        <View style={[s.topBar, { borderBottomColor: theme.border, backgroundColor: theme.background }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[s.topBarBtn, { color: theme.primary }]}>&#8592; უკან</Text>
          </TouchableOpacity>
          <Text style={[s.topBarTitle, { color: theme.text }]} numberOfLines={1}>
            {translation.book.title}
          </Text>
          <View style={s.topBarRight}>
            {/* Bookmark */}
            <TouchableOpacity onPress={toggleBookmark}>
              <Text style={[s.toolBtn, { color: isChapterBookmarked ? '#facc15' : theme.textSecondary }]}>
                {isChapterBookmarked ? '★' : '☆'}
              </Text>
            </TouchableOpacity>
            {/* Notes */}
            <TouchableOpacity onPress={() => setShowNotes(true)}>
              <Text style={[s.toolBtn, { color: theme.textSecondary }]}>📝</Text>
            </TouchableOpacity>
            {/* Bookmarks list */}
            <TouchableOpacity onPress={() => setShowBookmarks(true)}>
              <Text style={[s.toolBtn, { color: theme.textSecondary }]}>🔖</Text>
            </TouchableOpacity>
            {/* Theme toggle */}
            <TouchableOpacity onPress={toggleTheme}>
              <Text style={[s.toolBtn, { color: theme.textSecondary }]}>
                {isDark ? '☀️' : '🌙'}
              </Text>
            </TouchableOpacity>
            {/* Font controls */}
            <TouchableOpacity onPress={() => setFontSize((v) => Math.max(14, v - 2))}>
              <Text style={[s.fontBtn, { color: theme.primary }]}>A-</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setFontSize((v) => Math.min(28, v + 2))}>
              <Text style={[s.fontBtn, { color: theme.primary }]}>A+</Text>
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
        onTouchEnd={() => setShowControls(!showControls)}
      >
        {chapters.map((ch) => (
          <View key={ch.id} style={s.chapter}>
            <Text style={[s.chapterTitle, { color: theme.text, borderBottomColor: theme.border }]}>
              {ch.chapter.title || `თავი ${ch.chapter.number}`}
            </Text>
            <Text style={[s.chapterText, { fontSize, color: theme.text }]}>
              {ch.translatedContent}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* Bottom progress */}
      {showControls && (
        <View style={[s.bottomBar, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
          <View style={[s.progressBar, { backgroundColor: theme.border }]}>
            <View style={[s.progressFill, { width: `${percentage}%`, backgroundColor: theme.primary }]} />
          </View>
          <Text style={[s.progressText, { color: theme.textSecondary }]}>{percentage}%</Text>
        </View>
      )}

      {/* Bookmarks Modal */}
      <Modal visible={showBookmarks} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: theme.background }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: theme.text }]}>სანიშნეები</Text>
              <TouchableOpacity onPress={() => setShowBookmarks(false)}>
                <Text style={[s.modalClose, { color: theme.primary }]}>დახურვა</Text>
              </TouchableOpacity>
            </View>
            {bookmarks.length === 0 ? (
              <Text style={[s.emptyText, { color: theme.textSecondary }]}>სანიშნეები არ არის</Text>
            ) : (
              <FlatList
                data={bookmarks}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[s.listItem, { borderBottomColor: theme.border }]}
                    onPress={() => { setShowBookmarks(false); setActiveChapter(item.chapterNumber); }}
                  >
                    <Text style={[s.listItemText, { color: theme.text }]}>
                      თავი {item.chapterNumber}
                    </Text>
                    <Text style={[s.listItemDate, { color: theme.textSecondary }]}>
                      {new Date(item.createdAt).toLocaleDateString('ka-GE')}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Notes Modal */}
      <Modal visible={showNotes} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: theme.background }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: theme.text }]}>შენიშვნები</Text>
              <TouchableOpacity onPress={() => setShowNotes(false)}>
                <Text style={[s.modalClose, { color: theme.primary }]}>დახურვა</Text>
              </TouchableOpacity>
            </View>

            {/* Add note */}
            <View style={s.addNoteRow}>
              <TextInput
                style={[s.noteInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
                placeholder="შენიშვნის დამატება..."
                placeholderTextColor={theme.textSecondary}
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
              <Text style={[s.emptyText, { color: theme.textSecondary }]}>შენიშვნები არ არის</Text>
            ) : (
              <FlatList
                data={notes}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={[s.noteCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                    <View style={s.noteHeader}>
                      <Text style={[s.noteChapter, { color: theme.textSecondary }]}>
                        თავი {item.chapterNumber}
                      </Text>
                      <TouchableOpacity onPress={() => deleteNote(item.id)}>
                        <Text style={[s.deleteBtn, { color: theme.error }]}>წაშლა</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={[s.noteContent, { color: theme.text }]}>{item.content}</Text>
                  </View>
                )}
              />
            )}
          </View>
        </View>
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
  fontBtn: { fontSize: 15, fontWeight: '600' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20 },
  chapter: { marginBottom: 48 },
  chapterTitle: {
    fontSize: 22, fontWeight: '700', marginBottom: 16, paddingBottom: 8,
    borderBottomWidth: 1,
  },
  chapterText: { lineHeight: 32 },
  bottomBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8,
    borderTopWidth: 1,
  },
  progressBar: { flex: 1, height: 4, borderRadius: 2, marginRight: 12, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  progressText: { fontSize: 13, width: 36 },
  // Modal styles
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: SCREEN_HEIGHT * 0.7, borderTopLeftRadius: 20, borderTopRightRadius: 20,
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
  noteCard: {
    borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8,
  },
  noteHeader: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6,
  },
  noteChapter: { fontSize: 12, fontWeight: '500' },
  deleteBtn: { fontSize: 13, fontWeight: '500' },
  noteContent: { fontSize: 14, lineHeight: 20 },
});
