import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiRequest } from '@/services/api';
import { useTheme } from '@/theme/ThemeContext';
import { useTranslation } from '@/i18n/useTranslation';

interface PaymentItem {
  id: string;
  amount: string;
  currency: string;
  status: string;
  type: string;
  provider: string;
  description: string;
  paidAt: string | null;
  createdAt: string;
}

interface PaymentsResponse {
  payments: PaymentItem[];
  total: number;
  page: number;
  limit: number;
}

export default function PaymentsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchPayments = useCallback(async (pageNum: number, reset = false) => {
    try {
      const data = await apiRequest<PaymentsResponse>(
        `/payments/history?page=${pageNum}&limit=10`
      );
      setPayments((prev) => reset ? data.payments : [...prev, ...data.payments]);
      setHasMore(data.payments.length === 10);
    } catch {
      if (reset) setPayments([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPayments(1, true);
  }, [fetchPayments]);

  const onRefresh = () => {
    setRefreshing(true);
    setPage(1);
    fetchPayments(1, true);
  };

  const loadMore = () => {
    if (!hasMore || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPayments(nextPage);
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return '#22c55e';
      case 'PROCESSING': return '#f59e0b';
      case 'FAILED': return theme.error;
      case 'REFUNDED': return theme.textSecondary;
      default: return theme.textSecondary;
    }
  };

  const formatAmount = (amount: string, currency: string) => {
    const num = parseFloat(amount);
    if (currency === 'GEL') return `${num.toFixed(2)} ₾`;
    return `${num.toFixed(2)} ${currency}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(
      locale === 'ka' ? 'ka-GE' : 'en-US',
      { day: 'numeric', month: 'short', year: 'numeric' }
    );
  };

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <Text style={[s.pageTitle, { color: theme.text }]}>{t('payment_history.title')}</Text>

      <FlatList
        data={payments}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={payments.length === 0 ? s.center : s.list}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        renderItem={({ item }) => (
          <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={s.cardHeader}>
              <View style={[s.providerBadge, { backgroundColor: theme.primary + '15' }]}>
                <Text style={[s.providerText, { color: theme.primary }]}>{item.provider}</Text>
              </View>
              <Text style={[s.amount, { color: theme.text }]}>{formatAmount(item.amount, item.currency)}</Text>
            </View>
            {item.description && (
              <Text style={[s.description, { color: theme.textSecondary }]} numberOfLines={1}>{item.description}</Text>
            )}
            <View style={s.cardFooter}>
              <Text style={[s.date, { color: theme.textSecondary }]}>{formatDate(item.paidAt || item.createdAt)}</Text>
              <View style={[s.statusBadge, { backgroundColor: statusColor(item.status) + '20' }]}>
                <Text style={[s.statusText, { color: statusColor(item.status) }]}>
                  {t(`payment_history.status_${item.status.toLowerCase()}`)}
                </Text>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <View style={s.emptyContainer}>
              <Text style={s.emptyIcon}>💳</Text>
              <Text style={[s.emptyText, { color: theme.textSecondary }]}>{t('payment_history.empty')}</Text>
              <TouchableOpacity
                style={[s.searchBtn, { backgroundColor: theme.primary }]}
                onPress={() => router.push('/(tabs)/search')}
              >
                <Text style={s.searchBtnText}>{t('payment_history.start_translating')}</Text>
              </TouchableOpacity>
            </View>
          ) : null
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
  card: { borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  providerBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  providerText: { fontSize: 11, fontWeight: '700' },
  amount: { fontSize: 17, fontWeight: '700' },
  description: { fontSize: 13, marginBottom: 8 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: 12 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '600' },
  emptyContainer: { alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, marginBottom: 16 },
  searchBtn: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24 },
  searchBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
