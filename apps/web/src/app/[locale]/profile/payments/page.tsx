import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import PaymentsPage from './PaymentsPage';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'profile' });

  return {
    title: t('my_payments'),
    robots: { index: false, follow: false },
  };
}

export default function Page() {
  return <PaymentsPage />;
}
