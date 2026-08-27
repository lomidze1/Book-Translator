import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import SearchPage from './SearchPage';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://booktranslator.ge';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo' });

  return {
    title: t('search_title'),
    description: t('search_description'),
    alternates: {
      canonical: `${BASE_URL}/${locale}/search`,
      languages: { ka: `${BASE_URL}/ka/search`, 'x-default': `${BASE_URL}/ka/search` },
    },
    openGraph: {
      title: t('search_title'),
      description: t('search_description'),
      url: `${BASE_URL}/${locale}/search`,
    },
  };
}

export default function Page() {
  return <SearchPage />;
}
