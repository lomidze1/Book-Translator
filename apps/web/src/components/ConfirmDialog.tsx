'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import styles from './ConfirmDialog.module.scss';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const tCommon = useTranslations('common');
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onCancel();
        return;
      }
      // Focus trap. Without it, Tab walks back into the page underneath the
      // dialog while the overlay is visible — confusing for keyboard users.
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKey);
    const timer = setTimeout(() => {
      dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleKey);
      clearTimeout(timer);
      previousFocusRef.current?.focus();
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      onClick={e => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
      >
        <h2 id="confirm-title" className={styles.title}>{title}</h2>
        <p id="confirm-message" className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel ?? tCommon('cancel')}
          </button>
          <button
            type="button"
            className={`${styles.confirmBtn} ${variant === 'danger' ? styles.confirmBtnDanger : ''}`}
            onClick={onConfirm}
            disabled={busy}
            data-autofocus
          >
            {busy ? tCommon('working') : (confirmLabel ?? tCommon('confirm'))}
          </button>
        </div>
      </div>
    </div>
  );
}
