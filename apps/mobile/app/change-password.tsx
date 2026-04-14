import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiRequest } from '@/services/api';
import { useTheme } from '@/theme/ThemeContext';
import { useTranslation } from '@/i18n/useTranslation';
import { useToast } from '@/context/ToastContext';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (newPassword.length < 8) {
      showToast(t('change_password.error_password_min'), 'error');
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      showToast(t('change_password.error_password_uppercase'), 'error');
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      showToast(t('change_password.error_password_digit'), 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast(t('change_password.error_password_mismatch'), 'error');
      return;
    }

    setLoading(true);
    try {
      await apiRequest('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
      });
      setSuccess(true);
    } catch (err: any) {
      showToast(err.message || t('change_password.error_default'), 'error');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View style={[s.container, { backgroundColor: theme.background }]}>
        <View style={s.successInner}>
          <Text style={s.icon}>✉️</Text>
          <Text style={[s.successTitle, { color: theme.text }]}>{t('change_password.success_title')}</Text>
          <Text style={[s.successDesc, { color: theme.textSecondary }]}>
            {t('change_password.success_description')}
          </Text>
          <TouchableOpacity
            style={[s.button, { backgroundColor: theme.primary }]}
            onPress={() => router.back()}
          >
            <Text style={s.buttonText}>{t('confirm_password_change.back_to_profile')}</Text>
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
        <Text style={[s.title, { color: theme.text }]}>{t('change_password.title')}</Text>

        <Text style={[s.label, { color: theme.textSecondary }]}>{t('change_password.new_password')}</Text>
        <View style={[s.passwordContainer, { borderColor: theme.border }]}>
          <TextInput
            style={[s.passwordInput, { color: theme.text }]}
            placeholder={t('change_password.new_password_placeholder')}
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

        <Text style={[s.label, { color: theme.textSecondary }]}>{t('change_password.confirm_password')}</Text>
        <View style={[s.passwordContainer, { borderColor: theme.border }]}>
          <TextInput
            style={[s.passwordInput, { color: theme.text }]}
            placeholder={t('change_password.confirm_placeholder')}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showPassword}
            placeholderTextColor={theme.textSecondary}
          />
        </View>

        {newPassword && confirmPassword && newPassword !== confirmPassword && (
          <Text style={s.errorHint}>{t('change_password.error_password_mismatch')}</Text>
        )}

        <TouchableOpacity
          style={[s.button, { backgroundColor: theme.primary }, loading && s.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={s.buttonText}>
            {loading ? t('change_password.loading') : t('change_password.submit')}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  inner: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  successInner: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  icon: { fontSize: 56, marginBottom: 16 },
  successTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  successDesc: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 6, marginTop: 8 },
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
});
