import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { authService } from '@/services/auth';
import { apiRequest } from '@/services/api';
import { colors } from '@/theme/colors';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: string;
  createdAt: string;
}

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<UserProfile>('/users/profile')
      .then(setUser)
      .catch(() => {
        router.replace('/(auth)/login');
      })
      .finally(() => setLoading(false));
  }, [router]);

  const handleLogout = () => {
    Alert.alert('გასვლა', 'დარწმუნებული ხართ?', [
      { text: 'გაუქმება', style: 'cancel' },
      {
        text: 'გასვლა',
        style: 'destructive',
        onPress: async () => {
          await authService.logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  if (loading) {
    return <View style={s.center}><Text style={s.text}>იტვირთება...</Text></View>;
  }

  if (!user) return null;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{user.name?.[0]?.toUpperCase() || '?'}</Text>
        </View>
        <Text style={s.name}>{user.name}</Text>
        <Text style={s.email}>{user.email}</Text>
      </View>

      <View style={s.section}>
        <TouchableOpacity style={s.menuItem} onPress={() => router.push('/(tabs)/library')}>
          <Text style={s.menuText}>ჩემი ბიბლიოთეკა</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
        <Text style={s.logoutText}>გასვლა</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { color: colors.light.textSecondary },
  header: { alignItems: 'center', paddingVertical: 32, borderBottomWidth: 1, borderBottomColor: colors.light.border },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.light.primary,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  avatarText: { fontSize: 28, fontWeight: '700', color: '#fff' },
  name: { fontSize: 20, fontWeight: '600', color: colors.light.text },
  email: { fontSize: 14, color: colors.light.textSecondary, marginTop: 2 },
  section: { paddingVertical: 8 },
  menuItem: { paddingVertical: 14, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: colors.light.border },
  menuText: { fontSize: 16, color: colors.light.text },
  logoutBtn: { marginTop: 32, marginHorizontal: 24, paddingVertical: 14, backgroundColor: colors.light.error, borderRadius: 8, alignItems: 'center' },
  logoutText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
