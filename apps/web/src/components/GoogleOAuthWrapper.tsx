'use client';

import { GoogleOAuthProvider } from '@react-oauth/google';
import { useLocale } from 'next-intl';

interface GoogleOAuthWrapperProps {
  children: React.ReactNode;
}

export default function GoogleOAuthWrapper({ children }: GoogleOAuthWrapperProps) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const locale = useLocale();

  if (!clientId) {
    return <>{children}</>;
  }

  return (
    <GoogleOAuthProvider clientId={clientId} locale={locale}>
      {children}
    </GoogleOAuthProvider>
  );
}
