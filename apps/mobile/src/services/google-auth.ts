import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { authService } from './auth';
import { API_URL } from '@/config';

WebBrowser.maybeCompleteAuthSession();

const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

// webClientId is sufficient for all platforms with expo-auth-session
const isGoogleConfigured = !!webClientId;

interface GoogleAuthResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    avatar: string | null;
  };
}

export function useGoogleAuth() {
  // Pass a placeholder when not configured — hook must always be called (React rules)
  // but the button will be hidden via isConfigured, so promptAsync is never invoked
  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: iosClientId || 'NOT_CONFIGURED',
    androidClientId: androidClientId || 'NOT_CONFIGURED',
    webClientId: webClientId || 'NOT_CONFIGURED',
  });

  const signIn = async (): Promise<GoogleAuthResult> => {
    if (!isGoogleConfigured) {
      throw new Error('Google auth not configured');
    }

    const result = await promptAsync();

    if (result.type === 'cancel' || result.type === 'dismiss') {
      throw new Error('CANCELLED');
    }

    if (result.type !== 'success' || !result.params?.id_token) {
      throw new Error('Google authentication failed');
    }

    const idToken = result.params.id_token;

    const res = await fetch(`${API_URL}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || 'Google authentication failed');
    }

    const data: GoogleAuthResult = await res.json();

    if (!data.accessToken || !data.refreshToken) {
      throw new Error('Invalid server response');
    }

    await authService.setTokens(data.accessToken, data.refreshToken);
    return data;
  };

  return { signIn, request, isConfigured: isGoogleConfigured };
}
