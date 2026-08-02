import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import PreviewView from './PreviewView';

/**
 * noindex is deliberate: this page renders a machine translation of a
 * copyrighted work that the user uploaded. It must never enter a search index.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'preview' });

  return {
    title: t('title'),
    robots: { index: false, follow: false },
  };
}

export default function PreviewPage() {
  return <PreviewView />;
}
