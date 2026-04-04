'use client';

import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform,
  ScrollView,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useTheme } from '@/theme/ThemeContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleReset = async () => {
    if (!token.trim()) {
      Alert.alert('შეცდომა', 'შეიყვანეთ კოდი ელ-ფოსტიდან');
      return;
    }
    if (!newPassword) {
      Alert.alert('შეცდომა', 'შეიყვანეთ ახალი პაროლი');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('შეცდომა', 'პაროლი მინიმუმ 8 სიმბოლო უნდა იყოს');
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      Alert.alert('შეცდომა', 'პაროლი უნდა შეიცავდეს მინიმუმ 1 დიდ ასოს');
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      Alert.alert('შეცდომა', 'პაროლი უნდა შეიცავდეს მინიმუმ 1 ციფრს');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('შეცდომა', 'პაროლები არ ემთხვევა');
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
          throw new Error('კოდი არასწორია ან ვადაგასულია. სცადეთ თავიდან');
        }
        throw new Error('შეცდომა. სცადეთ მოგვიანებით');
      }

      setSuccess(true);
    } catch (err: any) {
      Alert.alert('შეცდომა', err.message || 'ქსელის შეცდომა');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View style={[s.container, { backgroundColor: theme.background }]}>
        <View style={s.inner}>
          <Text style={s.icon}>✅</Text>
          <Text style={[s.title, { color: theme.text }]}>პაროლი შეიცვალა!</Text>
          <Text style={[s.description, { color: theme.textSecondary }]}>
            თქვენი პაროლი წარმატებით განახლდა. ახლა შეგიძლიათ შეხვიდეთ ახალი პაროლით.
          </Text>

          <TouchableOpacity
            style={[s.button, { backgroundColor: theme.primary }]}
            onPress={() => router.replace('/(auth)/login')}
          >
            <Text style={s.buttonText}>შესვლის გვერდზე</Text>
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
        <Text style={[s.title, { color: theme.text }]}>ახალი პაროლი</Text>
        <Text style={[s.description, { color: theme.textSecondary }]}>
          ელ-ფოსტიდან დააკოპირეთ კოდი (ბმულის ბოლო ნაწილი token= შემდეგ) და შეიყვანეთ ახალი პაროლი.
        </Text>

        <Text style={[s.label, { color: theme.textSecondary }]}>კოდი ელ-ფოსტიდან</Text>
        <TextInput
          style={[s.input, s.tokenInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
          placeholder="ჩასვით კოდი აქ..."
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={theme.textSecondary}
        />

        <Text style={[s.label, { color: theme.textSecondary }]}>ახალი პაროლი</Text>
        <View style={[s.passwordContainer, { borderColor: theme.border }]}>
          <TextInput
            style={[s.passwordInput, { color: theme.text }]}
            placeholder="მინ. 8 სიმბოლო, 1 დიდი ასო, 1 ციფრი"
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

        <Text style={[s.label, { color: theme.textSecondary }]}>გაიმეორეთ პაროლი</Text>
        <View style={[s.passwordContainer, { borderColor: theme.border }]}>
          <TextInput
            style={[s.passwordInput, { color: theme.text }]}
            placeholder="იგივე პაროლი"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showPassword}
            placeholderTextColor={theme.textSecondary}
          />
        </View>

        {newPassword && confirmPassword && newPassword !== confirmPassword && (
          <Text style={s.errorHint}>პაროლები არ ემთხვევა</Text>
        )}

        <TouchableOpacity
          style={[s.button, { backgroundColor: theme.primary }, loading && s.buttonDisabled]}
          onPress={handleReset}
          disabled={loading}
        >
          <Text style={s.buttonText}>{loading ? 'იცვლება...' : 'პაროლის შეცვლა'}</Text>
        </TouchableOpacity>

        <Link href="/(auth)/forgot-password" style={s.link}>
          <Text style={[s.linkText, { color: theme.primary }]}>ახალი კოდის მოთხოვნა</Text>
        </Link>
        <Link href="/(auth)/login" style={s.link}>
          <Text style={[s.linkText, { color: theme.primary }]}>შესვლის გვერდზე დაბრუნება</Text>
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
