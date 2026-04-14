import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiRequest } from '@/services/api';
import { useTheme } from '@/theme/ThemeContext';
import { useTranslation } from '@/i18n/useTranslation';

interface BookWithProgress {
  id: string;
  title: string;
  author?: string;
  coverUrl?: string;
  translation?: { id: string; status: string; progress: number };
  readingProgress?: { percentage: number; currentChapter: number };
}

export default function LibraryScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [books, setBooks] = useState<BookWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLibrary = useCallback(async () => {
    try {
      const data = await apiRequest<BookWithProgress[]>('/translations/my');
      setBooks(data);
    } catch {
      setBooks([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLibrary();
  };

  const renderBook = ({ item }: { item: BookWithProgress }) => (
    <TouchableOpacity
      style={[s.bookCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={() => router.push(`/book/${item.id}`)}
    >
      {item.coverUrl ? (
        <Image source={{ uri: item.coverUrl }} style={s.cover} />
      ) : (
        <View style={[s.cover, s.coverPlaceholder, { backgroundColor: theme.border }]}>
          <Text style={[s.coverText, { color: theme.primary }]}>{item.title[0]}</Text>
        </View>
      )}
      <View style={s.bookInfo}>
        <Text style={[s.bookTitle, { color: theme.text }]} numberOfLines={2}>{item.title}</Text>
        {item.author && <Text style={[s.bookAuthor, { color: theme.textSecondary }]} numberOfLines={1}>{item.author}</Text>}
        {item.readingProgress && (
          <View style={s.progressContainer}>
            <View style={[s.progressBar, { backgroundColor: theme.border }]}>
              <View style={[s.progressFill, { width: `${item.readingProgress.percentage}%`, backgroundColor: theme.primary }]} />
            </View>
            <Text style={[s.progressText, { color: theme.textSecondary }]}>{Math.round(item.readingProgress.percentage)}%</Text>
          </View>
        )}
        {item.translation?.status === 'COMPLETED' && (
          <TouchableOpacity
            style={[s.readButton, { backgroundColor: theme.primary }]}
            onPress={() => router.push(`/reader/${item.id}`)}
          >
            <Text style={s.readButtonText}>
              {item.readingProgress ? t('library.continue') : t('library.read')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: theme.background }]}>
        <Text style={[s.emptyText, { color: theme.textSecondary }]}>{t('library.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={books}
        keyExtractor={(item) => item.id}
        renderItem={renderBook}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={books.length === 0 ? s.center : s.list}
        ListEmptyComponent={
          <View style={s.center}>
            <Text style={[s.emptyText, { color: theme.textSecondary }]}>{t('library.empty')}</Text>
            <TouchableOpacity style={[s.searchBtn, { backgroundColor: theme.primary }]} onPress={() => router.push('/(tabs)/search')}>
              <Text style={s.searchBtnText}>{t('library.search_books')}</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  list: { padding: 16 },
  bookCard: {
    flexDirection: 'row', borderRadius: 12,
    padding: 12, marginBottom: 12, borderWidth: 1,
  },
  cover: { width: 80, height: 120, borderRadius: 8 },
  coverPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  coverText: { fontSize: 28, fontWeight: '700' },
  bookInfo: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  bookTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  bookAuthor: { fontSize: 14, marginBottom: 8 },
  progressContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  progressBar: { flex: 1, height: 4, borderRadius: 2 },
  progressFill: { height: '100%', borderRadius: 2 },
  progressText: { fontSize: 12, width: 32 },
  readButton: {
    borderRadius: 6, paddingVertical: 6, paddingHorizontal: 16, alignSelf: 'flex-start',
  },
  readButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  emptyText: { fontSize: 16, marginBottom: 16 },
  searchBtn: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24 },
  searchBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
