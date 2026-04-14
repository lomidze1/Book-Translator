import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeContext';
import { useTranslation } from '@/i18n/useTranslation';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

type VerifyState = 'verifying' | 'success' | 'already_verified' | 'error';

export default function VerifyEmailScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [state, setState] = useState<VerifyState>('verifying');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setErrorMsg(t('verify_email.error_invalid_token'));
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`);
        if (res.ok) {
          setState('success');
          return;
        }

        const body = await res.json().catch(() => ({}));
        const msg = (body.message || '').toLowerCase();
        if (msg.includes('already verified') || msg.includes('already')) {
          setState('already_verified');
        } else {
          setState('error');
          setErrorMsg(t('verify_email.error_invalid_token'));
        }
      } catch {
        setState('error');
        setErrorMsg(t('verify_email.error_default'));
      }
    })();
  }, [token, t]);

  const icon = state === 'success' || state === 'already_verified' ? '✅' : state === 'error' ? '❌' : '';
  const title =
    state === 'verifying' ? t('verify_email.verifying') :
    state === 'success' ? t('verify_email.success') :
    state === 'already_verified' ? t('verify_email.already_verified') :
    t('common.error');
  const subtitle =
    state === 'success' ? t('verify_email.success_thanks') :
    state === 'error' ? errorMsg : '';

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <View style={s.inner}>
        {state === 'verifying' ? (
          <ActivityIndicator size="large" color={theme.primary} />
        ) : (
          <Text style={s.icon}>{icon}</Text>
        )}

        <Text style={[s.title, { color: theme.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[s.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
        ) : null}

        {state !== 'verifying' && (
          <TouchableOpacity
            style={[s.button, { backgroundColor: theme.primary }]}
            onPress={() => router.replace('/(auth)/login')}
          >
            <Text style={s.buttonText}>{t('verify_email.go_to_login')}</Text>
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
