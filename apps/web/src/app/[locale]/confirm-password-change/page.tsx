import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import ConfirmPasswordChangePage from './ConfirmPasswordChangePage';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'confirm_password_change' });

  return {
    title: t('title'),
    robots: { index: false, follow: false },
  };
}

export default function Page() {
  return <ConfirmPasswordChangePage />;
}
