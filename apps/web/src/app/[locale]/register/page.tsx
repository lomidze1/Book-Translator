import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import RegisterForm from './RegisterForm';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://booktranslator.ge';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo' });

  return {
    title: t('register_title'),
    description: t('register_description'),
    alternates: {
      canonical: `${BASE_URL}/${locale}/register`,
      languages: { ka: `${BASE_URL}/ka/register`, en: `${BASE_URL}/en/register`, 'x-default': `${BASE_URL}/ka/register` },
    },
    openGraph: {
      title: t('register_title'),
      description: t('register_description'),
      url: `${BASE_URL}/${locale}/register`,
      images: [{ url: `${BASE_URL}/og-image.png`, width: 1200, height: 630, alt: t('site_name') }],
    },
    robots: { index: false, follow: true },
  };
}

export default function Page() {
  return <RegisterForm />;
}
