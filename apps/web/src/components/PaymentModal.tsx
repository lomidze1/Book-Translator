'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Focus trap and Escape key handling
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    // Focus first focusable element in modal
    const timer = setTimeout(() => {
      const firstFocusable = modalRef.current?.querySelector<HTMLElement>('button');
      firstFocusable?.focus();
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
      previousFocusRef.current?.focus();
    };
  }, [onClose]);

  const handlePay = useCallback(async () => {
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
  }, [provider, bookId, type, translationId, onSuccess, t]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-modal-title"
      >
        <div className={styles.header}>
          <h2 id="payment-modal-title">{t('title')}</h2>
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

        <div className={styles.providers} role="radiogroup" aria-label={t('choose_provider')}>
          <div className={styles.providerLabel}>{t('choose_provider')}</div>
          <button
            className={`${styles.providerBtn} ${provider === 'BOG' ? styles.selected : ''}`}
            onClick={() => setProvider('BOG')}
            role="radio"
            aria-checked={provider === 'BOG'}
          >
            {t('provider_bog')}
          </button>
          <button
            className={`${styles.providerBtn} ${provider === 'TBC' ? styles.selected : ''}`}
            onClick={() => setProvider('TBC')}
            role="radio"
            aria-checked={provider === 'TBC'}
          >
            {t('provider_tbc')}
          </button>
        </div>

        {error && <div className={styles.error} role="alert">{error}</div>}

        <button
          className={styles.payBtn}
          onClick={handlePay}
          disabled={!provider || loading}
          aria-busy={loading}
        >
          {loading ? t('processing') : t('pay_button', { amount, currency: currency === 'GEL' ? '₾' : '$' })}
        </button>
      </div>
    </div>
  );
}
