import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { authService } from '@/services/auth';
import { colors } from '@/theme/colors';

export default function RegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name || !email || !password) return;
    setLoading(true);
    try {
      await authService.register(email, password, name);
      router.replace('/(tabs)/library');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={s.inner}>
        <Text style={s.title}>Book Translator</Text>
        <Text style={s.subtitle}>რეგისტრაცია</Text>

        <TextInput
          style={s.input}
          placeholder="სახელი"
          value={name}
          onChangeText={setName}
          placeholderTextColor={colors.light.textSecondary}
        />
        <TextInput
          style={s.input}
          placeholder="ელ-ფოსტა"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholderTextColor={colors.light.textSecondary}
        />
        <TextInput
          style={s.input}
          placeholder="პაროლი (მინ. 8 სიმბოლო)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholderTextColor={colors.light.textSecondary}
        />

        <TouchableOpacity
          style={[s.button, loading && s.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          <Text style={s.buttonText}>{loading ? 'იტვირთება...' : 'რეგისტრაცია'}</Text>
        </TouchableOpacity>

        <Link href="/(auth)/login" style={s.link}>
          <Text style={s.linkText}>უკვე გაქვთ ანგარიში? შესვლა</Text>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.background },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '700', color: colors.light.primary, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 18, color: colors.light.textSecondary, textAlign: 'center', marginBottom: 32 },
  input: {
    height: 48, borderWidth: 1, borderColor: colors.light.border, borderRadius: 8,
    paddingHorizontal: 16, fontSize: 16, marginBottom: 12, color: colors.light.text,
  },
  button: {
    height: 48, backgroundColor: colors.light.primary, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { marginTop: 20, alignSelf: 'center' },
  linkText: { color: colors.light.primary, fontSize: 14 },
});
