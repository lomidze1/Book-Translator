import { useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '@/theme/ThemeContext';
import { useTranslation } from '@/i18n/useTranslation';
import { useToast } from '@/context/ToastContext';
import { createPayment, type PaymentType } from '@/services/payment';

interface PaymentModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  bookId: string;
  type: PaymentType;
  amount?: number;
  currency?: string;
  translationId?: string;
}

export default function PaymentModal({
  visible, onClose, onSuccess, bookId, type, amount, currency = 'GEL', translationId,
}: PaymentModalProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { height: screenHeight } = useWindowDimensions();
  const [loading, setLoading] = useState(false);

  const handlePay = async () => {
    setLoading(true);
    try {
      const result = await createPayment({
        bookId,
        type,
        provider: 'FLITT',
        translationId,
      });

      // Open payment URL in browser
      const browserResult = await WebBrowser.openBrowserAsync(result.paymentUrl, {
        dismissButtonStyle: 'cancel',
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });

      // When browser closes, assume user completed or cancelled
      if (browserResult.type === 'cancel' || browserResult.type === 'dismiss') {
        onSuccess();
      }
    } catch (err: any) {
      showToast(err.message || t('payment.error_default'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = () => {
    if (!amount) return '';
    if (currency === 'GEL') return `${amount.toFixed(2)} ₾`;
    return `${amount.toFixed(2)} ${currency}`;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.content, { backgroundColor: theme.background, maxHeight: screenHeight * 0.6 }]}>
          {/* Header */}
          <View style={s.header}>
            <Text style={[s.title, { color: theme.text }]}>{t('payment.title')}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={[s.closeBtn, { color: theme.primary }]}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>

          {/* Amount */}
          {amount != null && (
            <View style={[s.amountCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[s.amountLabel, { color: theme.textSecondary }]}>{t('payment.amount_label')}</Text>
              <Text style={[s.amountValue, { color: theme.text }]}>{formatAmount()}</Text>
            </View>
          )}

          {/* Provider note */}
          <Text style={[s.providerNote, { color: theme.textSecondary }]}>
            {t('payment.provider_flitt_note')}
          </Text>

          {/* Pay Button */}
          <TouchableOpacity
            style={[s.payBtn, { backgroundColor: theme.primary }, loading && s.payBtnDisabled]}
            onPress={handlePay}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.payBtnText}>{t('payment.pay_button')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  content: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
  },
  title: { fontSize: 20, fontWeight: '700' },
  closeBtn: { fontSize: 15, fontWeight: '500' },
  amountCard: {
    borderRadius: 10, borderWidth: 1, padding: 16, alignItems: 'center', marginBottom: 20,
  },
  amountLabel: { fontSize: 13, marginBottom: 4 },
  amountValue: { fontSize: 28, fontWeight: '700' },
  providerNote: { fontSize: 14, marginBottom: 24, textAlign: 'center' },
  payBtn: { height: 52, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  payBtnDisabled: { opacity: 0.6 },
  payBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
