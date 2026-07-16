import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import LegalPage from '@/components/LegalPage';
import { termsContent } from './content';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://booktranslator.ge';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo' });

  return {
    title: t('terms_title'),
    description: t('terms_description'),
    alternates: {
      canonical: `${BASE_URL}/${locale}/terms`,
      languages: { ka: `${BASE_URL}/ka/terms`, en: `${BASE_URL}/en/terms`, 'x-default': `${BASE_URL}/ka/terms` },
    },
  };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <LegalPage doc={termsContent[locale === 'en' ? 'en' : 'ka']} />;
}
