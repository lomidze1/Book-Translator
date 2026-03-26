import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import VerifyEmailPage from './VerifyEmailPage';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo' });

  return {
    title: t('verify_email_title'),
    robots: { index: false, follow: false },
  };
}

export default function Page() {
  return <VerifyEmailPage />;
}
