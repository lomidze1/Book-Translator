import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { authService } from '@/services/auth';
import { apiRequest } from '@/services/api';
import { useTheme } from '@/theme/ThemeContext';
import { useTranslation } from '@/i18n/useTranslation';

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
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiRequest<UserProfile>('/users/profile')
      .then((data) => { if (!cancelled) setUser(data); })
      .catch(() => { if (!cancelled) router.replace('/(auth)/login'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleLogout = () => {
    Alert.alert(t('profile.logout'), t('profile.logout_confirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.logout'),
        style: 'destructive',
        onPress: async () => {
          await authService.logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: theme.background }]}>
        <Text style={[s.text, { color: theme.textSecondary }]}>{t('profile.loading')}</Text>
      </View>
    );
  }

  if (!user) return null;

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <View style={[s.header, { borderBottomColor: theme.border }]}>
        <View style={[s.avatar, { backgroundColor: theme.primary }]}>
          <Text style={s.avatarText}>{user.name?.[0]?.toUpperCase() || '?'}</Text>
        </View>
        <Text style={[s.name, { color: theme.text }]}>{user.name}</Text>
        <Text style={[s.email, { color: theme.textSecondary }]}>{user.email}</Text>
      </View>

      <View style={s.section}>
        <TouchableOpacity style={[s.menuItem, { borderBottomColor: theme.border }]} onPress={() => router.push('/(tabs)/library')}>
          <Text style={[s.menuText, { color: theme.text }]}>{t('profile.my_library')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.menuItem, { borderBottomColor: theme.border }]} onPress={() => router.push('/translations')}>
          <Text style={[s.menuText, { color: theme.text }]}>{t('profile.my_translations')}</Text>
        </TouchableOpacity>
        {/* Favorites is hidden, not deleted. app/favorites.tsx calls GET /favorites,
            which does not exist in the API — the screen 404s into a permanent
            "empty" state and nothing can add a favorite. Restore this entry once
            the backend ships the endpoint. */}
        <TouchableOpacity style={[s.menuItem, { borderBottomColor: theme.border }]} onPress={() => router.push('/payments')}>
          <Text style={[s.menuText, { color: theme.text }]}>{t('profile.my_payments')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.menuItem, { borderBottomColor: theme.border }]} onPress={() => router.push('/notifications')}>
          <Text style={[s.menuText, { color: theme.text }]}>{t('profile.notifications')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.menuItem, { borderBottomColor: theme.border }]} onPress={() => router.push('/settings')}>
          <Text style={[s.menuText, { color: theme.text }]}>{t('profile.settings')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.menuItem, { borderBottomColor: theme.border }]} onPress={() => router.push('/change-password')}>
          <Text style={[s.menuText, { color: theme.text }]}>{t('profile.change_password')}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={[s.logoutBtn, { backgroundColor: theme.error }]} onPress={handleLogout}>
        <Text style={s.logoutText}>{t('profile.logout')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: {},
  header: { alignItems: 'center', paddingVertical: 32, borderBottomWidth: 1 },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  avatarText: { fontSize: 28, fontWeight: '700', color: '#fff' },
  name: { fontSize: 20, fontWeight: '600' },
  email: { fontSize: 14, marginTop: 2 },
  section: { paddingVertical: 8 },
  menuItem: { paddingVertical: 14, paddingHorizontal: 24, borderBottomWidth: 1 },
  menuText: { fontSize: 16 },
  logoutBtn: { marginTop: 32, marginHorizontal: 24, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  logoutText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
