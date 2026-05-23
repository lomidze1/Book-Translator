import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import MockPaymentPage from './MockPaymentPage';

// The mock payment page lets the user pretend to approve a Flitt order
// without going through the real provider — strictly a development affordance.
// In production this route must not be reachable: even though the backend
// rejects mock callbacks once Flitt credentials are configured, exposing the
// page itself is a confusing UX surface and a phishing template waiting to
// happen.
const isProduction = process.env.NODE_ENV === 'production';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'payment' });

  return {
    title: t('mock_title'),
    robots: { index: false, follow: false },
  };
}

export default function Page() {
  if (isProduction) {
    notFound();
  }
  return <MockPaymentPage />;
}
