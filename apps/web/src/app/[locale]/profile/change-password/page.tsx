import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import ChangePasswordPage from './ChangePasswordPage';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'profile' });

  return {
    title: t('change_password'),
    robots: { index: false, follow: false },
  };
}

export default function Page() {
  return <ChangePasswordPage />;
}
