'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function MockPaymentPage() {
  const t = useTranslations('payment');
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') || '';
  const amount = searchParams.get('amount') || '0';
  const currency = searchParams.get('currency') || 'GEL';
  const [processing, setProcessing] = useState(false);

  const simulatePayment = async (status: 'success' | 'failed') => {
    setProcessing(true);

    // Determine provider from orderId prefix
    const provider = orderId.startsWith('tbc_') ? 'tbc' : 'bog';

    try {
      await fetch(`${API_URL}/api/payments/${provider}/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          orderId,
          status: status === 'success' ? 'success' : 'FAILED',
          amount: parseFloat(amount),
        }),
      });

      // Redirect to appropriate page
      const redirectPath = status === 'success' ? '/payment/success' : '/payment/failure';
      window.location.href = redirectPath;
    } catch {
      setProcessing(false);
    }
  };

  return (
    <div style={{ minHeight: 'calc(100vh - 140px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 420, padding: '2rem', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--card-border)' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>{t('mock_title')}</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{t('mock_description')}</p>

        <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--primary)', margin: '1.5rem 0' }}>
          {amount} {currency === 'GEL' ? '₾' : '$'}
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          Order: {orderId}
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button
            onClick={() => simulatePayment('success')}
            disabled={processing}
            style={{
              padding: '12px 28px',
              background: '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: processing ? 'not-allowed' : 'pointer',
              opacity: processing ? 0.6 : 1,
            }}
          >
            {t('mock_pay_success')}
          </button>
          <button
            onClick={() => simulatePayment('failed')}
            disabled={processing}
            style={{
              padding: '12px 28px',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: processing ? 'not-allowed' : 'pointer',
              opacity: processing ? 0.6 : 1,
            }}
          >
            {t('mock_pay_fail')}
          </button>
        </div>
      </div>
    </div>
  );
}
