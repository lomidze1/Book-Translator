'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import styles from './PaymentModal.module.scss';

interface PaymentModalProps {
  bookId: string;
  bookTitle: string;
  type: 'TRANSLATION' | 'PURCHASE_ORIGINAL' | 'PURCHASE_TRANSLATION';
  translationId?: string;
  amount: number;
  currency: string;
  onClose: () => void;
  onSuccess?: (paymentId: string) => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function PaymentModal({
  bookId,
  bookTitle,
  type,
  translationId,
  amount,
  currency,
  onClose,
  onSuccess,
}: PaymentModalProps) {
  const t = useTranslations('payment');
  const [provider, setProvider] = useState<'BOG' | 'TBC' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePay = async () => {
    if (!provider) return;

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          bookId,
          type,
          provider,
          translationId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || t('error_default'));
      }

      const data = await res.json();

      if (data.paymentUrl) {
        // Redirect to payment page (or mock page)
        window.location.href = data.paymentUrl;
      }

      if (onSuccess) {
        onSuccess(data.paymentId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error_default'));
    } finally {
      setLoading(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>{t('title')}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label={t('close')}>
            &times;
          </button>
        </div>

        <div className={styles.priceInfo}>
          <div className={styles.amount}>
            {amount} {currency === 'GEL' ? '₾' : '$'}
          </div>
          <div className={styles.description}>{bookTitle}</div>
        </div>

        <div className={styles.providers}>
          <div className={styles.providerLabel}>{t('choose_provider')}</div>
          <button
            className={`${styles.providerBtn} ${provider === 'BOG' ? styles.selected : ''}`}
            onClick={() => setProvider('BOG')}
          >
            {t('provider_bog')}
          </button>
          <button
            className={`${styles.providerBtn} ${provider === 'TBC' ? styles.selected : ''}`}
            onClick={() => setProvider('TBC')}
          >
            {t('provider_tbc')}
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <button
          className={styles.payBtn}
          onClick={handlePay}
          disabled={!provider || loading}
        >
          {loading ? t('processing') : t('pay_button', { amount, currency: currency === 'GEL' ? '₾' : '$' })}
        </button>
      </div>
    </div>
  );
}
