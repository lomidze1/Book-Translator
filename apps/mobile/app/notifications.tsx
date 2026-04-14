import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { useTheme } from '@/theme/ThemeContext';
import { useTranslation } from '@/i18n/useTranslation';
import { useNotifications } from '@/hooks/useNotifications';

function relativeTime(dateStr: string, t: (key: string, params?: Record<string, number>) => string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return t('notifications.just_now');
  if (diff < 3600) return t('notifications.minutes_ago', { count: Math.floor(diff / 60) });
  if (diff < 86400) return t('notifications.hours_ago', { count: Math.floor(diff / 3600) });
  return t('notifications.days_ago', { count: Math.floor(diff / 86400) });
}

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const {
    notifications, unreadCount, loading,
    fetchNotifications, markAsRead, markAllAsRead,
  } = useNotifications();

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: theme.border }]}>
        <Text style={[s.title, { color: theme.text }]}>{t('notifications.title')}</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllAsRead}>
            <Text style={[s.markAll, { color: theme.primary }]}>{t('notifications.mark_all_read')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => fetchNotifications(1)} />}
        contentContainerStyle={notifications.length === 0 ? s.center : s.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              s.notifCard,
              { borderBottomColor: theme.border },
              !item.read && { backgroundColor: theme.primary + '08' },
            ]}
            onPress={() => { if (!item.read) markAsRead(item.id); }}
            activeOpacity={0.7}
          >
            {!item.read && <View style={[s.unreadDot, { backgroundColor: theme.primary }]} />}
            <View style={s.notifContent}>
              <Text style={[s.notifTitle, { color: theme.text }]}>{item.title}</Text>
              <Text style={[s.notifBody, { color: theme.textSecondary }]} numberOfLines={2}>{item.body}</Text>
              <Text style={[s.notifTime, { color: theme.textSecondary }]}>
                {relativeTime(item.createdAt, t)}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? (
            <View style={s.emptyContainer}>
              <Text style={s.emptyIcon}>🔔</Text>
              <Text style={[s.emptyText, { color: theme.textSecondary }]}>{t('notifications.empty')}</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  title: { fontSize: 22, fontWeight: '700' },
  markAll: { fontSize: 13, fontWeight: '500' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  list: { paddingBottom: 16 },
  notifCard: {
    flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16,
    paddingVertical: 14, borderBottomWidth: 1,
  },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, marginRight: 10 },
  notifContent: { flex: 1 },
  notifTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  notifBody: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  notifTime: { fontSize: 11 },
  emptyContainer: { alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16 },
});
