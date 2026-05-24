'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import styles from '../page.module.scss';
import { API_URL } from '@/lib/api-client';


export default function MockPaymentPage() {
  const t = useTranslations('payment');
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') || '';
  const amount = searchParams.get('amount') || '0';
  const currency = searchParams.get('currency') || 'GEL';
  const [processing, setProcessing] = useState(false);

  const simulatePayment = async (status: 'success' | 'failed') => {
    setProcessing(true);

    try {
      // Mock mode: server accepts any payload and skips signature verification.
      await fetch(`${API_URL}/api/payments/flitt/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          order_status: status === 'success' ? 'approved' : 'declined',
          amount: Math.round(parseFloat(amount) * 100),
          currency,
          signature: 'mock',
        }),
      });

      const redirectPath = status === 'success' ? '/payment/success' : '/payment/failure';
      router.push(redirectPath);
    } catch {
      setProcessing(false);
    }
  };

  return (
    <main className={styles.main}>
      <section className={styles.mockCard}>
        <h1 className={styles.title}>{t('mock_title')}</h1>
        <p className={styles.message}>{t('mock_description')}</p>

        <div className={styles.mockAmount}>
          {amount} {currency === 'GEL' ? '₾' : '$'}
        </div>

        <p className={styles.mockOrderId}>Order: {orderId}</p>

        <div className={styles.mockActions}>
          <button
            onClick={() => simulatePayment('success')}
            disabled={processing}
            className={styles.btnSuccess}
            aria-busy={processing}
          >
            {t('mock_pay_success')}
          </button>
          <button
            onClick={() => simulatePayment('failed')}
            disabled={processing}
            className={styles.btnFailure}
            aria-busy={processing}
          >
            {t('mock_pay_fail')}
          </button>
        </div>
      </section>
    </main>
  );
}
