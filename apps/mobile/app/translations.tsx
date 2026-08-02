import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeContext';
import { useTranslation } from '@/i18n/useTranslation';
import { useDashboardData } from '@/hooks/useDashboardData';

export default function TranslationsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { translations, loading, error, retry } = useDashboardData();

  const statusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return '#22c55e';
      case 'IN_PROGRESS': return theme.primary;
      case 'FAILED': return theme.error;
      case 'PAID': return '#f59e0b';
      default: return theme.textSecondary;
    }
  };

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <Text style={[s.pageTitle, { color: theme.text }]}>{t('translation_history.title')}</Text>

      <FlatList
        data={translations}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={retry} />}
        contentContainerStyle={translations.length === 0 ? s.center : s.list}
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
              <Text style={[s.title, { color: theme.text }]} numberOfLines={1}>{item.book.title}</Text>
              {item.book.author && (
                <Text style={[s.author, { color: theme.textSecondary }]} numberOfLines={1}>{item.book.author}</Text>
              )}
              <View style={s.statusRow}>
                <View style={[s.statusBadge, { backgroundColor: statusColor(item.status) + '20' }]}>
                  <Text style={[s.statusText, { color: statusColor(item.status) }]}>
                    {t(`book.status_${item.status.toLowerCase()}`)}
                  </Text>
                </View>
                <Text style={[s.dateText, { color: theme.textSecondary }]}>
                  {new Date(item.createdAt).toLocaleDateString()}
                </Text>
              </View>
              {(item.status === 'IN_PROGRESS' || item.status === 'PAID') && (
                <View style={[s.progressBar, { backgroundColor: theme.border }]}>
                  <View style={[s.progressFill, { width: `${item.progress}%`, backgroundColor: theme.primary }]} />
                </View>
              )}
            </View>
            {item.status === 'COMPLETED' && (
              <TouchableOpacity
                style={[s.readBtn, { backgroundColor: theme.primary }]}
                onPress={() => router.push(`/reader/${item.book.id}`)}
              >
                <Text style={s.readBtnText}>{t('translation_history.read_book')}</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          loading ? null : error ? (
            // The hook already surfaced an error; ignoring it rendered "no
            // translations yet" over what is really a failed request.
            <View style={s.emptyContainer}>
              <Text style={[s.emptyText, { color: theme.textSecondary }]}>{t('common.network_error')}</Text>
              <TouchableOpacity style={[s.searchBtn, { backgroundColor: theme.primary }]} onPress={retry}>
                <Text style={s.searchBtnText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.emptyContainer}>
              <Text style={s.emptyIcon}>📚</Text>
              <Text style={[s.emptyText, { color: theme.textSecondary }]}>{t('translation_history.empty')}</Text>
              <TouchableOpacity
                style={[s.searchBtn, { backgroundColor: theme.primary }]}
                onPress={() => router.push('/(tabs)/search')}
              >
                <Text style={s.searchBtnText}>{t('translation_history.start_translating')}</Text>
              </TouchableOpacity>
            </View>
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
    flexDirection: 'row', alignItems: 'center', borderRadius: 10,
    padding: 12, marginBottom: 10, borderWidth: 1,
  },
  cover: { width: 50, height: 72, borderRadius: 6 },
  coverPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  coverText: { fontSize: 18, fontWeight: '700' },
  info: { flex: 1, marginLeft: 12 },
  title: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  author: { fontSize: 12, marginBottom: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '600' },
  dateText: { fontSize: 11 },
  progressBar: { height: 3, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  readBtn: { borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12 },
  readBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  emptyContainer: { alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, marginBottom: 16 },
  searchBtn: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24 },
  searchBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
