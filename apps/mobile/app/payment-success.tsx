import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeContext';
import { useTranslation } from '@/i18n/useTranslation';

export default function PaymentSuccessScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <View style={s.inner}>
        <Text style={s.icon}>✅</Text>
        <Text style={[s.title, { color: theme.text }]}>{t('payment.success_title')}</Text>
        <Text style={[s.message, { color: theme.textSecondary }]}>{t('payment.success_message')}</Text>
        <TouchableOpacity
          style={[s.button, { backgroundColor: theme.primary }]}
          onPress={() => router.replace('/(tabs)/dashboard')}
        >
          <Text style={s.buttonText}>{t('payment.back_to_books')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  icon: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  message: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  button: { height: 48, borderRadius: 10, paddingHorizontal: 32, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
