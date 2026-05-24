import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import HomePage from './HomePage';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://booktranslator.ge';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo' });

  return {
    title: t('home_title'),
    description: t('home_description'),
    alternates: {
      canonical: `${BASE_URL}/${locale}`,
      languages: { ka: `${BASE_URL}/ka`, en: `${BASE_URL}/en`, 'x-default': `${BASE_URL}/ka` },
    },
    openGraph: {
      title: t('home_title'),
      description: t('home_description'),
      url: `${BASE_URL}/${locale}`,
      type: 'website',
    },
  };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <HomePage locale={locale} />;
}
