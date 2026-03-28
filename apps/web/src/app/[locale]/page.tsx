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
      languages: { ka: `${BASE_URL}/ka`, en: `${BASE_URL}/en` },
    },
    openGraph: {
      title: t('home_title'),
      description: t('home_description'),
      url: `${BASE_URL}/${locale}`,
      type: 'website',
      images: [{ url: `${BASE_URL}/og-image.png`, width: 1200, height: 630, alt: 'Book Translator' }],
    },
  };
}

export default function Page() {
  return <HomePage />;
}
