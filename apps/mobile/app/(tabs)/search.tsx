import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiRequest } from '@/services/api';
import { useTheme } from '@/theme/ThemeContext';
import { useTranslation } from '@/i18n/useTranslation';

interface SearchResult {
  source: string;
  title: string;
  author?: string;
  coverUrl?: string;
  databaseBookId?: string;
}

export default function SearchScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const data = await apiRequest<{ external: SearchResult[]; database: any[] }>(
        `/books/search?q=${encodeURIComponent(query)}`
      );
      setResults(data.external || []);
      setError(false);
    } catch {
      // An empty result list and a failed request are very different things —
      // don't render "nothing found" when the network is down.
      setResults([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const renderResult = ({ item }: { item: SearchResult }) => (
    <TouchableOpacity
      style={[s.resultCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={() => item.databaseBookId && router.push(`/book/${item.databaseBookId}`)}
    >
      {item.coverUrl ? (
        <Image source={{ uri: item.coverUrl }} style={s.cover} />
      ) : (
        <View style={[s.cover, s.coverPlaceholder, { backgroundColor: theme.border }]}>
          <Text style={[s.coverText, { color: theme.primary }]}>{item.title[0]}</Text>
        </View>
      )}
      <View style={s.info}>
        <Text style={[s.title, { color: theme.text }]} numberOfLines={2}>{item.title}</Text>
        {item.author && <Text style={[s.author, { color: theme.textSecondary }]} numberOfLines={1}>{item.author}</Text>}
        <Text style={[s.source, { color: theme.textSecondary }]}>{item.source}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <View style={s.searchBar}>
        <TextInput
          style={[s.input, { borderColor: theme.border, color: theme.text }]}
          placeholder={t('search.placeholder')}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          placeholderTextColor={theme.textSecondary}
        />
        <TouchableOpacity style={[s.searchBtn, { backgroundColor: theme.primary }]} onPress={handleSearch}>
          <Text style={s.searchBtnText}>{t('search.button')}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={results}
        keyExtractor={(item, i) => item.databaseBookId || `${item.source}-${item.title}-${i}`}
        renderItem={renderResult}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          !loading ? (
            <View style={s.center}>
              <Text style={[s.emptyText, { color: theme.textSecondary }]}>
                {error ? t('common.network_error') : query ? t('search.no_results') : t('search.hint')}
              </Text>
              {error && (
                <TouchableOpacity onPress={handleSearch}>
                  <Text style={[s.emptyText, { color: theme.primary }]}>{t('common.retry')}</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={s.center}>
              <Text style={[s.emptyText, { color: theme.textSecondary }]}>{t('search.loading')}</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  searchBar: { flexDirection: 'row', padding: 16, gap: 8 },
  input: {
    flex: 1, height: 44, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 14, fontSize: 16,
  },
  searchBtn: {
    height: 44, paddingHorizontal: 16, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  searchBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  list: { padding: 16, paddingTop: 0 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 15 },
  resultCard: {
    flexDirection: 'row', borderRadius: 10,
    padding: 12, marginBottom: 10, borderWidth: 1,
  },
  cover: { width: 60, height: 90, borderRadius: 6 },
  coverPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  coverText: { fontSize: 22, fontWeight: '700' },
  info: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  author: { fontSize: 13, marginBottom: 4 },
  source: { fontSize: 11, textTransform: 'uppercase' },
});
