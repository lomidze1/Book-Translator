import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiRequest } from '@/services/api';
import { colors } from '@/theme/colors';

interface SearchResult {
  source: string;
  title: string;
  author?: string;
  coverUrl?: string;
  databaseBookId?: string;
}

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const data = await apiRequest<{ external: SearchResult[]; database: any[] }>(
        `/books/search?q=${encodeURIComponent(query)}`
      );
      setResults(data.external || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const renderResult = ({ item }: { item: SearchResult }) => (
    <TouchableOpacity
      style={s.resultCard}
      onPress={() => item.databaseBookId && router.push(`/book/${item.databaseBookId}`)}
    >
      {item.coverUrl ? (
        <Image source={{ uri: item.coverUrl }} style={s.cover} />
      ) : (
        <View style={[s.cover, s.coverPlaceholder]}>
          <Text style={s.coverText}>{item.title[0]}</Text>
        </View>
      )}
      <View style={s.info}>
        <Text style={s.title} numberOfLines={2}>{item.title}</Text>
        {item.author && <Text style={s.author} numberOfLines={1}>{item.author}</Text>}
        <Text style={s.source}>{item.source}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={s.container}>
      <View style={s.searchBar}>
        <TextInput
          style={s.input}
          placeholder="მოძებნე წიგნი..."
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          placeholderTextColor={colors.light.textSecondary}
        />
        <TouchableOpacity style={s.searchBtn} onPress={handleSearch}>
          <Text style={s.searchBtnText}>ძებნა</Text>
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
              <Text style={s.emptyText}>
                {query ? 'შედეგები ვერ მოიძებნა' : 'ძებნის დასაწყებად შეიყვანეთ სათაური'}
              </Text>
            </View>
          ) : (
            <View style={s.center}><Text style={s.emptyText}>იტვირთება...</Text></View>
          )
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.background },
  searchBar: { flexDirection: 'row', padding: 16, gap: 8 },
  input: {
    flex: 1, height: 44, borderWidth: 1, borderColor: colors.light.border, borderRadius: 8,
    paddingHorizontal: 14, fontSize: 16, color: colors.light.text,
  },
  searchBtn: {
    height: 44, paddingHorizontal: 16, backgroundColor: colors.light.primary, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  searchBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  list: { padding: 16, paddingTop: 0 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 15, color: colors.light.textSecondary },
  resultCard: {
    flexDirection: 'row', backgroundColor: colors.light.surface, borderRadius: 10,
    padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.light.border,
  },
  cover: { width: 60, height: 90, borderRadius: 6, backgroundColor: colors.light.border },
  coverPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  coverText: { fontSize: 22, fontWeight: '700', color: colors.light.primary },
  info: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '600', color: colors.light.text, marginBottom: 2 },
  author: { fontSize: 13, color: colors.light.textSecondary, marginBottom: 4 },
  source: { fontSize: 11, color: colors.light.textSecondary, textTransform: 'uppercase' },
});
