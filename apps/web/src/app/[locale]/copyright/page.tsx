import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import LegalPage from '@/components/LegalPage';
import { copyrightContent } from './content';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://booktranslator.ge';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo' });

  return {
    title: t('copyright_title'),
    description: t('copyright_description'),
    alternates: {
      canonical: `${BASE_URL}/${locale}/copyright`,
      languages: { ka: `${BASE_URL}/ka/copyright`, en: `${BASE_URL}/en/copyright`, 'x-default': `${BASE_URL}/ka/copyright` },
    },
  };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <LegalPage doc={copyrightContent[locale === 'en' ? 'en' : 'ka']} />;
}
