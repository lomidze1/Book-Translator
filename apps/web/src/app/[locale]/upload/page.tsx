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
      languages: { ka: `${BASE_URL}/ka/upload`, en: `${BASE_URL}/en/upload`, 'x-default': `${BASE_URL}/ka/upload` },
    },
    openGraph: {
      title: t('upload_title'),
      description: t('upload_description'),
      url: `${BASE_URL}/${locale}/upload`,
      images: [{ url: `${BASE_URL}/og-image.png`, width: 1200, height: 630, alt: t('site_name') }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('upload_title'),
      description: t('upload_description'),
      images: [`${BASE_URL}/og-image.png`],
    },
  };
}

export default function Page() {
  return <UploadPage />;
}
