'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';
import styles from './PaymentModal.module.scss';

// Maps backend error messages (English, raw from NestJS exceptions) to
// translation keys. The backend doesn't return error codes, so we pattern-
// match the message. New backend messages must be added here as well.
function mapPaymentError(
  status: number,
  message: string | undefined,
  t: (key: string) => string,
): string {
  if (status === 429) return t('error_rate_limit');
  const msg = (message ?? '').toLowerCase();
  if (msg.includes('book not found')) return t('error_book_not_found');
  if (msg.includes('do not have access')) return t('error_no_access');
  if (msg.includes('already have a pending payment')) return t('error_already_pending');
  if (msg.includes('is not supported') || msg.includes('unknown provider')) {
    return t('error_provider_unsupported');
  }
  if (msg.includes('amount mismatch')) return t('error_amount_mismatch');
  if (msg.includes('payment creation failed')) return t('error_creation_failed');
  if (msg.includes('translationtype')) return t('error_translation_type_required');
  return t('error_default');
}

interface PaymentModalProps {
  bookId: string;
  bookTitle: string;
  type: 'TRANSLATION' | 'PURCHASE_ORIGINAL' | 'PURCHASE_TRANSLATION';
  translationId?: string;
  // Required when type === 'TRANSLATION' — the server enforces this and uses it
  // to pick the FAST vs STANDARD price tier.
  translationType?: 'FAST' | 'STANDARD';
  amount: number;
  currency: string;
  onClose: () => void;
  onSuccess?: (paymentId: string) => void;
}

export default function PaymentModal({
  bookId,
  bookTitle,
  type,
  translationId,
  translationType,
  amount,
  currency,
  onClose,
  onSuccess,
}: PaymentModalProps) {
  const t = useTranslations('payment');
  const [loading, setLoading] = useState(false);
  // Tracks the moment between "server returned a payment URL" and
  // "browser actually starts navigating to the bank". On slow networks the
  // visible state would otherwise sit on "processing…" with no signal that
  // the redirect is imminent.
  const [redirecting, setRedirecting] = useState(false);
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
    setLoading(true);
    setError('');

    try {
      const res = await apiFetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId,
          type,
          provider: 'FLITT',
          translationId,
          translationType,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(mapPaymentError(res.status, data.message, t));
      }

      const data = await res.json();

      if (data.paymentUrl) {
        // Tell the user we're handing them off to the provider before the
        // browser jumps. A short delay lets the message paint and gives the
        // user a chance to read it — set assign() async so React commits
        // the state update first.
        setRedirecting(true);
        setTimeout(() => {
          window.location.href = data.paymentUrl;
        }, 50);
      }

      if (onSuccess) {
        onSuccess(data.paymentId);
      }
    } catch (err) {
      if (err instanceof TypeError) {
        // Network error (fetch failed before getting a response).
        setError(t('error_server'));
      } else {
        setError(err instanceof Error ? err.message : t('error_default'));
      }
      setLoading(false);
      return;
    }
    // Note: do NOT clear `loading` in the success path — the page is about
    // to navigate away and we want the button to stay disabled until then.
  }, [bookId, type, translationId, translationType, onSuccess, t]);

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

        <div className={styles.providerInfo}>{t('provider_flitt_note')}</div>

        {error && <div className={styles.error} role="alert">{error}</div>}

        {redirecting && (
          <div className={styles.redirecting} role="status" aria-live="polite">
            <span className={styles.redirectingSpinner} aria-hidden="true" />
            {t('redirecting_to_bank')}
          </div>
        )}

        <button
          className={styles.payBtn}
          onClick={handlePay}
          disabled={loading || redirecting}
          aria-busy={loading || redirecting}
        >
          {redirecting
            ? t('redirecting')
            : loading
              ? t('processing')
              : t('pay_button', { amount, currency: currency === 'GEL' ? '₾' : '$' })}
        </button>
      </div>
    </div>
  );
}
