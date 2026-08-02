import { useEffect, useState } from 'react';
import {
  View, Text, Image, ScrollView, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiRequest } from '@/services/api';
import { useTheme } from '@/theme/ThemeContext';
import { useTranslation } from '@/i18n/useTranslation';
import PaymentModal from '@/components/common/PaymentModal';
import { PURCHASES_ENABLED } from '@/config';

interface BookData {
  id: string;
  title: string;
  author?: string;
  description?: string;
  coverUrl?: string;
  pageCount?: number;
  language?: string;
  source?: string;
}

interface TranslationInfo {
  id: string;
  status: string;
  progress: number;
  translationType: string;
}

export default function BookDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [book, setBook] = useState<BookData | null>(null);
  const [translations, setTranslations] = useState<TranslationInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPayment, setShowPayment] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const bookData = await apiRequest<BookData>(`/books/${id}`);
        setBook(bookData);

        try {
          const trans = await apiRequest<TranslationInfo[]>(`/translations/book/${id}`);
          setTranslations(trans);
        } catch {
          // No translations yet — that's okay
        }
      } catch {
        setError(t('book.loading_error'));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, t]);

  const completedTranslation = translations.find((tr) => tr.status === 'COMPLETED');
  const inProgressTranslation = translations.find(
    (tr) => tr.status === 'IN_PROGRESS' || tr.status === 'PAID',
  );

  const statusLabel = (status: string) => {
    const key = `book.status_${status.toLowerCase()}` as const;
    return t(key);
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return '#22c55e';
      case 'IN_PROGRESS': return theme.primary;
      case 'FAILED': return theme.error;
      default: return theme.textSecondary;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[s.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </SafeAreaView>
    );
  }

  if (error || !book) {
    return (
      <SafeAreaView style={[s.center, { backgroundColor: theme.background }]}>
        <Text style={[s.errorText, { color: theme.error }]}>{error}</Text>
        <TouchableOpacity style={[s.btn, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
          <Text style={s.btnText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Cover */}
        <View style={s.coverSection}>
          {book.coverUrl ? (
            <Image source={{ uri: book.coverUrl }} style={s.cover} resizeMode="cover" />
          ) : (
            <View style={[s.coverPlaceholder, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[s.coverPlaceholderText, { color: theme.textSecondary }]}>
                {book.title.charAt(0)}
              </Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={s.infoSection}>
          <Text style={[s.title, { color: theme.text }]}>{book.title}</Text>
          {book.author && (
            <Text style={[s.author, { color: theme.textSecondary }]}>{book.author}</Text>
          )}

          {/* Meta */}
          <View style={s.metaRow}>
            {book.pageCount && (
              <View style={[s.metaChip, { backgroundColor: theme.surface }]}>
                <Text style={[s.metaText, { color: theme.textSecondary }]}>
                  {book.pageCount} {t('book.pages')}
                </Text>
              </View>
            )}
            {book.language && (
              <View style={[s.metaChip, { backgroundColor: theme.surface }]}>
                <Text style={[s.metaText, { color: theme.textSecondary }]}>
                  {book.language.toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          {book.description && (
            <Text style={[s.description, { color: theme.text }]}>{book.description}</Text>
          )}
        </View>

        {/* Translation Status */}
        {translations.length > 0 && (
          <View style={[s.section, { borderTopColor: theme.border }]}>
            <Text style={[s.sectionTitle, { color: theme.text }]}>{t('book.translation_status')}</Text>
            {translations.map((tr) => (
              <View key={tr.id} style={[s.translationRow, { borderColor: theme.border }]}>
                <View style={s.translationInfo}>
                  <Text style={[s.translationType, { color: theme.text }]}>
                    {tr.translationType === 'FAST' ? t('book.type_fast') : t('book.type_standard')}
                  </Text>
                  <Text style={[s.translationStatus, { color: statusColor(tr.status) }]}>
                    {statusLabel(tr.status)}
                  </Text>
                </View>
                {(tr.status === 'IN_PROGRESS' || tr.status === 'PAID') && (
                  <View style={[s.progressBar, { backgroundColor: theme.border }]}>
                    <View style={[s.progressFill, { width: `${tr.progress}%`, backgroundColor: theme.primary }]} />
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Actions */}
        <View style={s.actions}>
          {completedTranslation && (
            <TouchableOpacity
              style={[s.btn, s.btnPrimary, { backgroundColor: theme.primary }]}
              onPress={() => router.push(`/reader/${book.id}`)}
            >
              <Text style={s.btnText}>{t('book.read')}</Text>
            </TouchableOpacity>
          )}
          {inProgressTranslation && !completedTranslation && (
            <View style={[s.btn, s.btnDisabled, { backgroundColor: theme.surface }]}>
              <Text style={[s.btnDisabledText, { color: theme.textSecondary }]}>
                {t('book.translation_in_progress', { progress: Math.round(inProgressTranslation.progress) })}
              </Text>
            </View>
          )}
          {translations.length === 0 && (
            PURCHASES_ENABLED ? (
              <TouchableOpacity
                style={[s.btn, s.btnPrimary, { backgroundColor: theme.primary }]}
                onPress={() => setShowPayment(true)}
              >
                <Text style={s.btnText}>{t('book.order_translation')}</Text>
              </TouchableOpacity>
            ) : (
              // Neutral status only. Apple 3.1.3 forbids steering users to an
              // external purchase, so there is deliberately no CTA and no link.
              <View style={[s.btn, s.btnDisabled, { backgroundColor: theme.surface }]}>
                <Text style={[s.btnDisabledText, { color: theme.textSecondary }]}>
                  {t('book.no_translation_yet')}
                </Text>
              </View>
            )
          )}
        </View>
      </ScrollView>

      {PURCHASES_ENABLED && (
        <PaymentModal
          visible={showPayment}
          onClose={() => setShowPayment(false)}
          onSuccess={() => {
            setShowPayment(false);
            // Refresh translations
            apiRequest<TranslationInfo[]>(`/translations/book/${id}`)
              .then(setTranslations)
              .catch(() => {});
          }}
          bookId={book.id}
          type="TRANSLATION"
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingBottom: 40 },
  coverSection: { alignItems: 'center', paddingTop: 24, paddingBottom: 16 },
  cover: { width: 160, height: 220, borderRadius: 8 },
  coverPlaceholder: {
    width: 160, height: 220, borderRadius: 8, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center',
  },
  coverPlaceholderText: { fontSize: 48, fontWeight: '700' },
  infoSection: { paddingHorizontal: 24, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 6 },
  author: { fontSize: 16, marginBottom: 12 },
  metaRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  metaChip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  metaText: { fontSize: 13, fontWeight: '500' },
  description: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 8 },
  section: { marginTop: 24, paddingTop: 20, paddingHorizontal: 24, borderTopWidth: 1 },
  sectionTitle: { fontSize: 17, fontWeight: '600', marginBottom: 12 },
  translationRow: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8 },
  translationInfo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  translationType: { fontSize: 14, fontWeight: '500' },
  translationStatus: { fontSize: 13, fontWeight: '600' },
  progressBar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  actions: { paddingHorizontal: 24, paddingTop: 24 },
  btn: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnPrimary: {},
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnDisabled: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnDisabledText: { fontSize: 15 },
  errorText: { fontSize: 16, marginBottom: 16 },
});
