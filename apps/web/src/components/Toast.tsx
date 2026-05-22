'use client';

import { useTranslations } from 'next-intl';
import { useToast } from '@/context/ToastContext';
import styles from './Toast.module.scss';

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();
  // Reuse the existing `payment.close` translation rather than introduce a
  // new namespace — both languages already provide a localized "Close" string
  // there.
  const tPayment = useTranslations('payment');

  if (toasts.length === 0) return null;

  return (
    <div className={styles.container} aria-live="polite">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`${styles.toast} ${styles[toast.type]}`}
          role="alert"
        >
          <span className={styles.message}>{toast.message}</span>
          <button
            className={styles.close}
            onClick={() => removeToast(toast.id)}
            aria-label={tPayment('close')}
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
