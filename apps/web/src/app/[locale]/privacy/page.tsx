import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import LegalPage from '@/components/LegalPage';
import { privacyContent } from './content';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://booktranslator.ge';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo' });

  return {
    title: t('privacy_title'),
    description: t('privacy_description'),
    alternates: {
      canonical: `${BASE_URL}/${locale}/privacy`,
      languages: { ka: `${BASE_URL}/ka/privacy`, 'x-default': `${BASE_URL}/ka/privacy` },
    },
  };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <LegalPage doc={privacyContent[locale === 'en' ? 'en' : 'ka']} />;
}
