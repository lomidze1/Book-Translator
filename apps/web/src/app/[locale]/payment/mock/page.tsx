import type { Metadata } from 'next';
import MockPaymentPage from './MockPaymentPage';

export const metadata: Metadata = {
  title: 'Mock Payment',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <MockPaymentPage />;
}
