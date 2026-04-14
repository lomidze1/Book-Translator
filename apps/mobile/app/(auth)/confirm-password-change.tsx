import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeContext';
import { useTranslation } from '@/i18n/useTranslation';
import { useToast } from '@/context/ToastContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

type ConfirmState = 'confirming' | 'success' | 'error';

export default function ConfirmPasswordChangeScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [state, setState] = useState<ConfirmState>('confirming');

  useEffect(() => {
    if (!token) {
      setState('error');
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/confirm-password-change`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        if (res.ok) {
          setState('success');
          showToast(t('confirm_password_change.success'), 'success');
        } else {
          setState('error');
        }
      } catch {
        setState('error');
      }
    })();
  }, [token, t, showToast]);

  const icon = state === 'success' ? '✅' : state === 'error' ? '❌' : '';
  const title =
    state === 'confirming' ? t('confirm_password_change.confirming') :
    state === 'success' ? t('confirm_password_change.success') :
    t('confirm_password_change.error_invalid');

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <View style={s.inner}>
        {state === 'confirming' ? (
          <ActivityIndicator size="large" color={theme.primary} />
        ) : (
          <Text style={s.icon}>{icon}</Text>
        )}

        <Text style={[s.title, { color: theme.text }]}>{title}</Text>

        {state === 'success' && (
          <Text style={[s.subtitle, { color: theme.textSecondary }]}>
            {t('confirm_password_change.success_description')}
          </Text>
        )}

        {state !== 'confirming' && (
          <TouchableOpacity
            style={[s.button, { backgroundColor: theme.primary }]}
            onPress={() => router.replace('/(tabs)/profile')}
          >
            <Text style={s.buttonText}>{t('confirm_password_change.back_to_profile')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  icon: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  button: {
    height: 48, borderRadius: 8, paddingHorizontal: 32,
    justifyContent: 'center', alignItems: 'center', marginTop: 16,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
