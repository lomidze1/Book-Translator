import { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { useTheme } from '@/theme/ThemeContext';
import { useTranslation } from '@/i18n/useTranslation';
import { useGoogleAuth } from '@/services/google-auth';

interface GoogleSignInButtonProps {
  onSuccess: () => void;
  onError: (message: string) => void;
}

export default function GoogleSignInButton({ onSuccess, onError }: GoogleSignInButtonProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { signIn, request, isConfigured } = useGoogleAuth();
  const [loading, setLoading] = useState(false);

  if (!isConfigured) return null;

  const handlePress = async () => {
    setLoading(true);
    try {
      await signIn();
      onSuccess();
    } catch (err: any) {
      if (err.message === 'CANCELLED') {
        // User cancelled — do nothing
        return;
      }
      onError(err.message || t('login.error_default'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      style={[s.button, { borderColor: theme.border, backgroundColor: theme.surface }]}
      onPress={handlePress}
      disabled={!request || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator size="small" color={theme.text} />
      ) : (
        <View style={s.content}>
          <Text style={s.googleLogo}>G</Text>
          <Text style={[s.text, { color: theme.text }]}>Google</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  button: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  googleLogo: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4285F4',
  },
  text: {
    fontSize: 16,
    fontWeight: '500',
  },
});
