'use client';

import { useToast } from '@/context/ToastContext';
import styles from './Toast.module.scss';

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();

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
            aria-label="Close"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
