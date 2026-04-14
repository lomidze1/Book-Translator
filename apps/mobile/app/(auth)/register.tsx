import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { authService } from '@/services/auth';
import { useTheme } from '@/theme/ThemeContext';
import { useTranslation } from '@/i18n/useTranslation';
import { useToast } from '@/context/ToastContext';
import GoogleSignInButton from '@/components/common/GoogleSignInButton';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

export default function RegisterScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((v) => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleRegister = async () => {
    if (!name || !email || !password) return;
    setLoading(true);
    try {
      await authService.register(email, password, name);
      setRegistered(true);
    } catch (err: any) {
      const raw = err.message || '';
      const translated = raw.startsWith('auth.errors.') ? t(raw) : raw;
      showToast(translated || t('register.error_default'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0) return;
    try {
      await fetch(`${API_URL}/api/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      showToast(t('register_verify.resend_sent'), 'success');
      setResendCooldown(60);
    } catch {
      showToast(t('common.network_error'), 'error');
    }
  }, [email, resendCooldown, showToast, t]);

  if (registered) {
    return (
      <View style={[s.container, { backgroundColor: theme.background }]}>
        <View style={s.verifyInner}>
          <Text style={s.icon}>✉️</Text>
          <Text style={[s.verifyTitle, { color: theme.text }]}>{t('register_verify.check_email_title')}</Text>
          <Text style={[s.verifyDesc, { color: theme.textSecondary }]}>
            {t('register_verify.check_email_description')}{'\n'}
            <Text style={{ fontWeight: '600', color: theme.text }}>{email}</Text>
          </Text>

          <TouchableOpacity
            style={[s.resendBtn, { borderColor: theme.border }, resendCooldown > 0 && s.buttonDisabled]}
            onPress={handleResend}
            disabled={resendCooldown > 0}
          >
            <Text style={[s.resendText, { color: theme.primary }]}>
              {resendCooldown > 0
                ? t('register_verify.resend_cooldown', { seconds: resendCooldown })
                : t('register_verify.resend')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.button, { backgroundColor: theme.primary }]}
            onPress={() => router.replace('/(auth)/login')}
          >
            <Text style={s.buttonText}>{t('register_verify.back_to_login')}</Text>
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
      <View style={s.inner}>
        <Text style={[s.title, { color: theme.primary }]}>{t('register.title')}</Text>
        <Text style={[s.subtitle, { color: theme.textSecondary }]}>{t('register.subtitle')}</Text>

        <TextInput
          style={[s.input, { borderColor: theme.border, color: theme.text }]}
          placeholder={t('register.name')}
          value={name}
          onChangeText={setName}
          placeholderTextColor={theme.textSecondary}
        />
        <TextInput
          style={[s.input, { borderColor: theme.border, color: theme.text }]}
          placeholder={t('register.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholderTextColor={theme.textSecondary}
        />

        <View style={[s.passwordContainer, { borderColor: theme.border }]}>
          <TextInput
            style={[s.passwordInput, { color: theme.text }]}
            placeholder={t('register.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            placeholderTextColor={theme.textSecondary}
          />
          <TouchableOpacity
            style={s.eyeBtn}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Text style={[s.eyeIcon, { color: theme.textSecondary }]}>
              {showPassword ? '🙈' : '👁'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[s.button, { backgroundColor: theme.primary }, loading && s.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          <Text style={s.buttonText}>{loading ? t('register.loading') : t('register.submit')}</Text>
        </TouchableOpacity>

        <View style={s.dividerRow}>
          <View style={[s.dividerLine, { backgroundColor: theme.border }]} />
          <Text style={[s.dividerText, { color: theme.textSecondary }]}>{t('login.or_divider')}</Text>
          <View style={[s.dividerLine, { backgroundColor: theme.border }]} />
        </View>

        <GoogleSignInButton
          onSuccess={() => router.replace('/(tabs)/dashboard')}
          onError={(msg) => showToast(msg, 'error')}
        />

        <Link href="/(auth)/login" style={s.link}>
          <Text style={[s.linkText, { color: theme.primary }]}>{t('register.has_account')}</Text>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  verifyInner: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  icon: { fontSize: 56, marginBottom: 16 },
  verifyTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  verifyDesc: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 18, textAlign: 'center', marginBottom: 32 },
  input: {
    height: 48, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 16, fontSize: 16, marginBottom: 12,
  },
  passwordContainer: {
    flexDirection: 'row', alignItems: 'center', height: 48,
    borderWidth: 1, borderRadius: 8, marginBottom: 12,
  },
  passwordInput: {
    flex: 1, height: '100%', paddingHorizontal: 16, fontSize: 16,
  },
  eyeBtn: {
    paddingHorizontal: 14, height: '100%', justifyContent: 'center',
  },
  eyeIcon: { fontSize: 20 },
  button: {
    height: 48, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  resendBtn: {
    height: 48, borderRadius: 8, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8, width: '100%',
  },
  resendText: { fontSize: 15, fontWeight: '500' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 4 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 12, fontSize: 13 },
  link: { marginTop: 20, alignSelf: 'center' },
  linkText: { fontSize: 14 },
});
