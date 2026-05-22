import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import LoginForm from './LoginForm';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://booktranslator.ge';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo' });

  return {
    title: t('login_title'),
    description: t('login_description'),
    alternates: {
      canonical: `${BASE_URL}/${locale}/login`,
      languages: { ka: `${BASE_URL}/ka/login`, en: `${BASE_URL}/en/login`, 'x-default': `${BASE_URL}/ka/login` },
    },
    openGraph: {
      title: t('login_title'),
      description: t('login_description'),
      url: `${BASE_URL}/${locale}/login`,
      images: [{ url: `${BASE_URL}/og-image.png`, width: 1200, height: 630, alt: t('site_name') }],
    },
    robots: { index: false, follow: true },
  };
}

export default function Page() {
  return <LoginForm />;
}
