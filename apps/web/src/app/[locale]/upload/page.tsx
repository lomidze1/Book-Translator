import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import UploadPage from './UploadPage';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://booktranslator.ge';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo' });

  return {
    title: t('upload_title'),
    description: t('upload_description'),
    alternates: {
      canonical: `${BASE_URL}/${locale}/upload`,
      languages: { ka: `${BASE_URL}/ka/upload`, 'x-default': `${BASE_URL}/ka/upload` },
    },
    openGraph: {
      title: t('upload_title'),
      description: t('upload_description'),
      url: `${BASE_URL}/${locale}/upload`,
    },
    twitter: {
      card: 'summary_large_image',
      title: t('upload_title'),
      description: t('upload_description'),
    },
  };
}

export default function Page() {
  return <UploadPage />;
}
