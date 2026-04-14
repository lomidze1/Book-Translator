import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeContext';
import { useTranslation } from '@/i18n/useTranslation';
import { useDashboardData } from '@/hooks/useDashboardData';

export default function DashboardScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const { stats, recentActivity, loading, error, retry } = useDashboardData();

  const statusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return '#22c55e';
      case 'IN_PROGRESS': return theme.primary;
      case 'FAILED': return theme.error;
      default: return theme.textSecondary;
    }
  };

  const dateStr = new Date().toLocaleDateString(locale === 'ka' ? 'ka-GE' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  if (error) {
    return (
      <View style={[s.center, { backgroundColor: theme.background }]}>
        <Text style={[s.errorText, { color: theme.error }]}>{t('dashboard.error')}</Text>
        <TouchableOpacity style={[s.retryBtn, { backgroundColor: theme.primary }]} onPress={retry}>
          <Text style={s.retryText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      style={[s.container, { backgroundColor: theme.background }]}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={retry} />}
      data={recentActivity}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <>
          {/* Greeting */}
          <Text style={[s.date, { color: theme.textSecondary }]}>{dateStr}</Text>

          {/* Stats */}
          <View style={s.statsRow}>
            {[
              { label: t('dashboard.stats_books'), value: stats.totalBooks, color: theme.primary },
              { label: t('dashboard.stats_in_progress'), value: stats.inProgress, color: '#f59e0b' },
              { label: t('dashboard.stats_completed'), value: stats.completed, color: '#22c55e' },
            ].map((stat) => (
              <View key={stat.label} style={[s.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
                <Text style={[s.statLabel, { color: theme.textSecondary }]}>{stat.label}</Text>
              </View>
            ))}
          </View>

          {/* Quick Actions */}
          <View style={s.actionsRow}>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: theme.primary }]}
              onPress={() => router.push('/(tabs)/search')}
            >
              <Text style={s.actionText}>{t('dashboard.search_books')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}
              onPress={() => router.push('/upload')}
            >
              <Text style={[s.actionText, { color: theme.primary }]}>{t('dashboard.upload_book')}</Text>
            </TouchableOpacity>
          </View>

          {/* Recent Activity Header */}
          <Text style={[s.sectionTitle, { color: theme.text }]}>{t('dashboard.recent_activity')}</Text>
        </>
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={[s.activityCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => router.push(`/book/${item.book.id}`)}
        >
          {item.book.coverUrl ? (
            <Image source={{ uri: item.book.coverUrl }} style={s.cover} />
          ) : (
            <View style={[s.cover, s.coverPlaceholder, { backgroundColor: theme.border }]}>
              <Text style={[s.coverText, { color: theme.primary }]}>{item.book.title[0]}</Text>
            </View>
          )}
          <View style={s.activityInfo}>
            <Text style={[s.activityTitle, { color: theme.text }]} numberOfLines={1}>{item.book.title}</Text>
            <Text style={[s.activityStatus, { color: statusColor(item.status) }]}>
              {t(`book.status_${item.status.toLowerCase()}`)}
            </Text>
            {(item.status === 'IN_PROGRESS' || item.status === 'PAID') && (
              <View style={[s.progressBar, { backgroundColor: theme.border }]}>
                <View style={[s.progressFill, { width: `${item.progress}%`, backgroundColor: theme.primary }]} />
              </View>
            )}
          </View>
          {item.status === 'COMPLETED' && (
            <TouchableOpacity
              style={[s.continueBtn, { backgroundColor: theme.primary }]}
              onPress={() => router.push(`/reader/${item.book.id}`)}
            >
              <Text style={s.continueText}>{t('dashboard.continue_reading')}</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      )}
      ListEmptyComponent={
        !loading ? (
          <Text style={[s.emptyText, { color: theme.textSecondary }]}>{t('dashboard.no_activity')}</Text>
        ) : null
      }
    />
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  content: { padding: 16 },
  date: { fontSize: 14, marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: {
    flex: 1, borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1,
  },
  statValue: { fontSize: 24, fontWeight: '700', marginBottom: 2 },
  statLabel: { fontSize: 11, textAlign: 'center' },
  actionsRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  actionBtn: { flex: 1, height: 44, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  actionText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  sectionTitle: { fontSize: 17, fontWeight: '600', marginBottom: 12 },
  activityCard: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 10,
    padding: 12, marginBottom: 8, borderWidth: 1,
  },
  cover: { width: 48, height: 68, borderRadius: 6 },
  coverPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  coverText: { fontSize: 18, fontWeight: '700' },
  activityInfo: { flex: 1, marginLeft: 12 },
  activityTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  activityStatus: { fontSize: 12, fontWeight: '500', marginBottom: 4 },
  progressBar: { height: 3, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  continueBtn: { borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12 },
  continueText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  emptyText: { fontSize: 15, textAlign: 'center', paddingVertical: 24 },
  errorText: { fontSize: 16, marginBottom: 16 },
  retryBtn: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24 },
  retryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
