'use client';

import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useTheme } from '@/theme/ThemeContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) {
      Alert.alert('შეცდომა', 'შეიყვანეთ ელ-ფოსტა');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body.message || '';
        if (msg.toLowerCase().includes('too many')) {
          throw new Error('ძალიან ბევრი მცდელობა. სცადეთ 15 წუთში');
        }
        throw new Error('შეცდომა. სცადეთ მოგვიანებით');
      }

      setSent(true);
    } catch (err: any) {
      Alert.alert('შეცდომა', err.message || 'ქსელის შეცდომა');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <View style={[s.container, { backgroundColor: theme.background }]}>
        <View style={s.inner}>
          <Text style={[s.icon]}>✉️</Text>
          <Text style={[s.title, { color: theme.text }]}>შეამოწმეთ ელ-ფოსტა</Text>
          <Text style={[s.description, { color: theme.textSecondary }]}>
            პაროლის აღდგენის ბმული გამოგზავნილია მისამართზე:{'\n'}
            <Text style={{ fontWeight: '600', color: theme.text }}>{email}</Text>
          </Text>
          <Text style={[s.hint, { color: theme.textSecondary }]}>
            ბმული მოქმედებს 1 საათის განმავლობაში.{'\n'}
            თუ ვერ იპოვეთ, შეამოწმეთ სპამის საქაღალდე.
          </Text>

          <TouchableOpacity
            style={[s.button, { backgroundColor: theme.primary }]}
            onPress={() => router.push('/(auth)/reset-password')}
          >
            <Text style={s.buttonText}>კოდი მაქვს, პაროლის შეცვლა</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.secondaryButton, { borderColor: theme.border }]}
            onPress={() => { setSent(false); setEmail(''); }}
          >
            <Text style={[s.secondaryButtonText, { color: theme.primary }]}>სხვა ელ-ფოსტაზე გაგზავნა</Text>
          </TouchableOpacity>

          <Link href="/(auth)/login" style={s.link}>
            <Text style={[s.linkText, { color: theme.primary }]}>შესვლის გვერდზე დაბრუნება</Text>
          </Link>
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
        <Text style={[s.icon]}>🔑</Text>
        <Text style={[s.title, { color: theme.text }]}>დაგავიწყდათ პაროლი?</Text>
        <Text style={[s.description, { color: theme.textSecondary }]}>
          შეიყვანეთ თქვენი ელ-ფოსტა და გამოგიგზავნით პაროლის აღდგენის ბმულს.
        </Text>

        <TextInput
          style={[s.input, { borderColor: theme.border, color: theme.text }]}
          placeholder="ელ-ფოსტა"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoFocus
          placeholderTextColor={theme.textSecondary}
        />

        <TouchableOpacity
          style={[s.button, { backgroundColor: theme.primary }, loading && s.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={s.buttonText}>{loading ? 'იგზავნება...' : 'გაგზავნა'}</Text>
        </TouchableOpacity>

        <Link href="/(auth)/login" style={s.link}>
          <Text style={[s.linkText, { color: theme.primary }]}>უკან შესვლის გვერდზე</Text>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  icon: { fontSize: 48, textAlign: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  description: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  hint: { fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  input: {
    height: 48, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 16, fontSize: 16, marginBottom: 12,
  },
  button: {
    height: 48, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    height: 48, borderRadius: 8, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center', marginTop: 12,
  },
  secondaryButtonText: { fontSize: 15, fontWeight: '500' },
  link: { marginTop: 20, alignSelf: 'center' },
  linkText: { fontSize: 14 },
});
