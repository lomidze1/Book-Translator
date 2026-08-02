import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useTheme } from '@/theme/ThemeContext';
import { useTranslation } from '@/i18n/useTranslation';
import { useToast } from '@/context/ToastContext';

import { API_URL } from '@/config';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleReset = async () => {
    if (!token.trim()) {
      showToast(t('reset_password.error_token_empty'), 'error');
      return;
    }
    if (!newPassword) {
      showToast(t('reset_password.error_password_empty'), 'error');
      return;
    }
    if (newPassword.length < 8) {
      showToast(t('reset_password.error_password_min'), 'error');
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      showToast(t('reset_password.error_password_uppercase'), 'error');
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      showToast(t('reset_password.error_password_digit'), 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast(t('reset_password.error_password_mismatch'), 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), newPassword }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = (body.message || '').toLowerCase();
        if (msg.includes('invalid') || msg.includes('expired')) {
          throw new Error(t('reset_password.error_invalid_token'));
        }
        throw new Error(t('reset_password.error_default'));
      }

      setSuccess(true);
    } catch (err: any) {
      showToast(err.message || t('reset_password.error_network'), 'error');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View style={[s.container, { backgroundColor: theme.background }]}>
        <View style={s.inner}>
          <Text style={s.icon}>✅</Text>
          <Text style={[s.title, { color: theme.text }]}>{t('reset_password.success_title')}</Text>
          <Text style={[s.description, { color: theme.textSecondary }]}>
            {t('reset_password.success_description')}
          </Text>

          <TouchableOpacity
            style={[s.button, { backgroundColor: theme.primary }]}
            onPress={() => router.replace('/(auth)/login')}
          >
            <Text style={s.buttonText}>{t('reset_password.go_to_login')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
        <Text style={s.icon}>🔐</Text>
        <Text style={[s.title, { color: theme.text }]}>{t('reset_password.title')}</Text>
        <Text style={[s.description, { color: theme.textSecondary }]}>
          {t('reset_password.subtitle')}
        </Text>

        <Text style={[s.label, { color: theme.textSecondary }]}>{t('reset_password.token_label')}</Text>
        <TextInput
          style={[s.input, s.tokenInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
          placeholder={t('reset_password.token_placeholder')}
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={theme.textSecondary}
        />

        <Text style={[s.label, { color: theme.textSecondary }]}>{t('reset_password.password_label')}</Text>
        <View style={[s.passwordContainer, { borderColor: theme.border }]}>
          <TextInput
            style={[s.passwordInput, { color: theme.text }]}
            placeholder={t('reset_password.password_placeholder')}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry={!showPassword}
            placeholderTextColor={theme.textSecondary}
          />
          <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
            <Text style={[s.eyeIcon, { color: theme.textSecondary }]}>
              {showPassword ? '🙈' : '👁'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[s.label, { color: theme.textSecondary }]}>{t('reset_password.confirm_label')}</Text>
        <View style={[s.passwordContainer, { borderColor: theme.border }]}>
          <TextInput
            style={[s.passwordInput, { color: theme.text }]}
            placeholder={t('reset_password.confirm_placeholder')}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showPassword}
            placeholderTextColor={theme.textSecondary}
          />
        </View>

        {newPassword && confirmPassword && newPassword !== confirmPassword && (
          <Text style={s.errorHint}>{t('reset_password.error_password_mismatch')}</Text>
        )}

        <TouchableOpacity
          style={[s.button, { backgroundColor: theme.primary }, loading && s.buttonDisabled]}
          onPress={handleReset}
          disabled={loading}
        >
          <Text style={s.buttonText}>{loading ? t('reset_password.loading') : t('reset_password.submit')}</Text>
        </TouchableOpacity>

        <Link href="/(auth)/forgot-password" style={s.link}>
          <Text style={[s.linkText, { color: theme.primary }]}>{t('reset_password.request_new_code')}</Text>
        </Link>
        <Link href="/(auth)/login" style={s.link}>
          <Text style={[s.linkText, { color: theme.primary }]}>{t('reset_password.back_to_login')}</Text>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  inner: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  icon: { fontSize: 48, textAlign: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  description: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 6, marginTop: 8 },
  input: {
    height: 48, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 16, fontSize: 16, marginBottom: 4,
  },
  tokenInput: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, height: 52 },
  passwordContainer: {
    flexDirection: 'row', alignItems: 'center', height: 48,
    borderWidth: 1, borderRadius: 8, marginBottom: 4,
  },
  passwordInput: { flex: 1, height: '100%', paddingHorizontal: 16, fontSize: 16 },
  eyeBtn: { paddingHorizontal: 14, height: '100%', justifyContent: 'center' },
  eyeIcon: { fontSize: 20 },
  errorHint: { color: '#ef4444', fontSize: 13, marginBottom: 4, marginTop: 2 },
  button: {
    height: 48, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center', marginTop: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { marginTop: 16, alignSelf: 'center' },
  linkText: { fontSize: 14 },
});
