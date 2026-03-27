import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import PaymentSuccessPage from './PaymentSuccessPage';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo' });

  return {
    title: t('payment_success_title'),
    robots: { index: false, follow: false },
  };
}

export default function Page() {
  return <PaymentSuccessPage />;
}
