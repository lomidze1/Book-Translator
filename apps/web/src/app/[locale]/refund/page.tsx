import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import LegalPage from '@/components/LegalPage';
import { refundContent } from './content';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://booktranslator.ge';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo' });

  return {
    title: t('refund_title'),
    description: t('refund_description'),
    alternates: {
      canonical: `${BASE_URL}/${locale}/refund`,
      languages: { ka: `${BASE_URL}/ka/refund`, en: `${BASE_URL}/en/refund`, 'x-default': `${BASE_URL}/ka/refund` },
    },
  };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <LegalPage doc={refundContent[locale === 'en' ? 'en' : 'ka']} />;
}
