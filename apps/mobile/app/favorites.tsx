import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiRequest } from '@/services/api';
import { useTheme } from '@/theme/ThemeContext';
import { useTranslation } from '@/i18n/useTranslation';

interface FavoriteBook {
  id: string;
  book: {
    id: string;
    title: string;
    author?: string;
    coverUrl?: string;
  };
}

export default function FavoritesScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [favorites, setFavorites] = useState<FavoriteBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFavorites = useCallback(async () => {
    try {
      const data = await apiRequest<FavoriteBook[]>('/favorites');
      setFavorites(data);
    } catch {
      setFavorites([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchFavorites();
  };

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <Text style={[s.pageTitle, { color: theme.text }]}>{t('favorites.title')}</Text>

      <FlatList
        data={favorites}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={favorites.length === 0 ? s.center : s.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => router.push(`/book/${item.book.id}`)}
          >
            {item.book.coverUrl ? (
              <Image source={{ uri: item.book.coverUrl }} style={s.cover} />
            ) : (
              <View style={[s.cover, s.coverPlaceholder, { backgroundColor: theme.border }]}>
                <Text style={[s.coverText, { color: theme.primary }]}>{item.book.title[0]}</Text>
              </View>
            )}
            <View style={s.info}>
              <Text style={[s.title, { color: theme.text }]} numberOfLines={2}>{item.book.title}</Text>
              {item.book.author && (
                <Text style={[s.author, { color: theme.textSecondary }]} numberOfLines={1}>{item.book.author}</Text>
              )}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? (
            <View style={s.emptyContainer}>
              <Text style={s.emptyIcon}>⭐</Text>
              <Text style={[s.emptyText, { color: theme.textSecondary }]}>{t('favorites.empty')}</Text>
              <TouchableOpacity
                style={[s.browseBtn, { backgroundColor: theme.primary }]}
                onPress={() => router.push('/(tabs)/search')}
              >
                <Text style={s.browseBtnText}>{t('favorites.browse_books')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={[s.loadingText, { color: theme.textSecondary }]}>{t('common.loading')}</Text>
          )
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  pageTitle: { fontSize: 24, fontWeight: '700', padding: 16, paddingBottom: 8 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  list: { padding: 16, paddingTop: 8 },
  card: {
    flexDirection: 'row', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1,
  },
  cover: { width: 60, height: 90, borderRadius: 6 },
  coverPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  coverText: { fontSize: 22, fontWeight: '700' },
  info: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  author: { fontSize: 13 },
  emptyContainer: { alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, marginBottom: 16 },
  browseBtn: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24 },
  browseBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  loadingText: { fontSize: 15, textAlign: 'center' },
});
