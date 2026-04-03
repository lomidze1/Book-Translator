import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import SettingsPage from './SettingsPage';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const seo = await getTranslations({ locale, namespace: 'seo' });

  return {
    title: seo('settings_title'),
    robots: { index: false, follow: false },
  };
}

export default function Page() {
  return <SettingsPage />;
}
