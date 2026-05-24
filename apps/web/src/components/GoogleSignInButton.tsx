'use client';

import { useState } from 'react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { API_URL } from '@/lib/api-client';


interface GoogleSignInButtonProps {
  onError: (message: string) => void;
  redirectTo?: string;
}

export default function GoogleSignInButton({ onError, redirectTo = '/dashboard' }: GoogleSignInButtonProps) {
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const t = useTranslations('google_auth');

  // Don't render if Google Client ID is not configured
  if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
    return null;
  }

  const handleSuccess = async (credentialResponse: CredentialResponse) => {
    const idToken = credentialResponse.credential;
    if (!idToken) {
      onError(t('error'));
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        credentials: 'include', // Refresh token cookie set by backend.
      });

      const data = await response.json();

      if (!response.ok) {
        onError(data.message || t('error'));
        return;
      }

      login(data.accessToken, data.user);
      router.push(redirectTo);
    } catch {
      onError(t('error'));
    } finally {
      setLoading(false);
    }
  };

  const handleError = () => {
    onError(t('error'));
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', opacity: loading ? 0.5 : 1, pointerEvents: loading ? 'none' : 'auto' }}>
      <GoogleLogin
        onSuccess={handleSuccess}
        onError={handleError}
        size="large"
        shape="rectangular"
        theme="outline"
        text="signin_with"
        width={320}
      />
    </div>
  );
}
