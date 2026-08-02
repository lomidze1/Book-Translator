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
import { API_URL } from '@/config';

export default function LoginScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((v) => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);
    setEmailNotVerified(false);
    try {
      await authService.login(email, password);
      router.replace('/(tabs)/dashboard');
    } catch (err: any) {
      const raw = err.message || '';
      const lower = raw.toLowerCase();
      if (lower.includes('not verified') || lower.includes('email_not_verified') || (err.status === 403)) {
        setEmailNotVerified(true);
      } else {
        // If the error is an i18n key (auth.errors.*), translate it; otherwise show raw
        const translated = raw.startsWith('auth.errors.') ? t(raw) : raw;
        showToast(translated || t('login.error_default'), 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = useCallback(async () => {
    if (resendCooldown > 0 || !email) return;
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

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={s.inner}>
        {router.canGoBack() && (
          <TouchableOpacity style={s.backButton} onPress={() => router.back()}>
            <Text style={[s.backButtonText, { color: theme.primary }]}>&#8592; {t('common.back')}</Text>
          </TouchableOpacity>
        )}

        <Text style={[s.title, { color: theme.primary }]}>{t('login.title')}</Text>
        <Text style={[s.subtitle, { color: theme.textSecondary }]}>{t('login.subtitle')}</Text>

        <TextInput
          style={[s.input, { borderColor: theme.border, color: theme.text }]}
          placeholder={t('login.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholderTextColor={theme.textSecondary}
        />

        <View style={[s.passwordContainer, { borderColor: theme.border }]}>
          <TextInput
            style={[s.passwordInput, { color: theme.text }]}
            placeholder={t('login.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            placeholderTextColor={theme.textSecondary}
          />
          <TouchableOpacity
            style={s.eyeBtn}
            onPress={() => setShowPassword(!showPassword)}
            accessibilityLabel={showPassword ? t('login.hide_password') : t('login.show_password')}
          >
            <Text style={[s.eyeIcon, { color: theme.textSecondary }]}>
              {showPassword ? '🙈' : '👁'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[s.button, { backgroundColor: theme.primary }, loading && s.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={s.buttonText}>{loading ? t('login.loading') : t('login.submit')}</Text>
        </TouchableOpacity>

        {emailNotVerified && (
          <View style={[s.verifyBanner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[s.verifyText, { color: theme.text }]}>{t('login_verify.email_not_verified')}</Text>
            <TouchableOpacity
              onPress={handleResendVerification}
              disabled={resendCooldown > 0}
              style={[s.resendBtn, resendCooldown > 0 && s.buttonDisabled]}
            >
              <Text style={[s.resendText, { color: theme.primary }]}>
                {resendCooldown > 0
                  ? t('register_verify.resend_cooldown', { seconds: resendCooldown })
                  : t('login_verify.resend_verification')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={s.dividerRow}>
          <View style={[s.dividerLine, { backgroundColor: theme.border }]} />
          <Text style={[s.dividerText, { color: theme.textSecondary }]}>{t('login.or_divider')}</Text>
          <View style={[s.dividerLine, { backgroundColor: theme.border }]} />
        </View>

        <GoogleSignInButton
          onSuccess={() => router.replace('/(tabs)/dashboard')}
          onError={(msg) => showToast(msg, 'error')}
        />

        <Link href="/(auth)/forgot-password" style={s.forgotLink}>
          <Text style={[s.forgotText, { color: theme.textSecondary }]}>{t('login.forgot_password')}</Text>
        </Link>

        <Link href="/(auth)/register" style={s.link}>
          <Text style={[s.linkText, { color: theme.primary }]}>{t('login.no_account')}</Text>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  backButton: { position: 'absolute', top: 56, left: 24, zIndex: 1 },
  backButtonText: { fontSize: 16, fontWeight: '500' },
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
  verifyBanner: {
    marginTop: 12, padding: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center',
  },
  verifyText: { fontSize: 14, marginBottom: 8, textAlign: 'center' },
  resendBtn: { paddingVertical: 6 },
  resendText: { fontSize: 14, fontWeight: '500' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 4 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 12, fontSize: 13 },
  forgotLink: { marginTop: 16, alignSelf: 'center' },
  forgotText: { fontSize: 13 },
  link: { marginTop: 12, alignSelf: 'center' },
  linkText: { fontSize: 14 },
});
