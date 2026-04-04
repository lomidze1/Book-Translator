import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { authService } from '@/services/auth';
import { useTheme } from '@/theme/ThemeContext';

export default function LoginScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);
    try {
      await authService.login(email, password);
      router.replace('/(tabs)/library');
    } catch (err: any) {
      Alert.alert('შეცდომა', err.message || 'შესვლა ვერ მოხერხდა');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={s.inner}>
        <Text style={[s.title, { color: theme.primary }]}>Book Translator</Text>
        <Text style={[s.subtitle, { color: theme.textSecondary }]}>შესვლა</Text>

        <TextInput
          style={[s.input, { borderColor: theme.border, color: theme.text }]}
          placeholder="ელ-ფოსტა"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholderTextColor={theme.textSecondary}
        />

        <View style={[s.passwordContainer, { borderColor: theme.border }]}>
          <TextInput
            style={[s.passwordInput, { color: theme.text }]}
            placeholder="პაროლი"
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
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={s.buttonText}>{loading ? 'იტვირთება...' : 'შესვლა'}</Text>
        </TouchableOpacity>

        <Link href="/(auth)/forgot-password" style={s.forgotLink}>
          <Text style={[s.forgotText, { color: theme.textSecondary }]}>დაგავიწყდათ პაროლი?</Text>
        </Link>

        <Link href="/(auth)/register" style={s.link}>
          <Text style={[s.linkText, { color: theme.primary }]}>არ გაქვთ ანგარიში? რეგისტრაცია</Text>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
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
  forgotLink: { marginTop: 16, alignSelf: 'center' },
  forgotText: { fontSize: 13 },
  link: { marginTop: 12, alignSelf: 'center' },
  linkText: { fontSize: 14 },
});
