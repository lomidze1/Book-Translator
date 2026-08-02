'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { usePreview } from '@/hooks/usePreview';
import styles from './preview-cta.module.scss';

/**
 * "Read a free preview" entry point. Deliberately a sibling of the buy CTA
 * rather than another branch in its state machine — the two are orthogonal, and
 * this one stays visible while a payment is pending (exactly when a wavering
 * user wants to see quality).
 */
export default function PreviewCta({ bookId }: { bookId: string }) {
  const t = useTranslations('preview');
  const { preview, loading, generating, error, generate } = usePreview(bookId);

  if (loading) return null;

  if (generating || preview?.status === 'PENDING' || preview?.status === 'IN_PROGRESS') {
    return (
      <div className={styles.wrap}>
        <div className={styles.generating} role="status" aria-live="polite">
          <div className={styles.spinner} aria-hidden="true" />
          <div>
            <p className={styles.generatingText}>{t('generating')}</p>
            <p className={styles.hint}>{t('generating_hint')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (preview?.status === 'COMPLETED') {
    return (
      <div className={styles.wrap}>
        <Link href={`/books/${bookId}/preview`} className={styles.btnPreview}>
          {t('cta_ready')}
        </Link>
      </div>
    );
  }

  const errorMessage =
    error === 'quota'
      ? t('error_quota')
      : error === 'unavailable'
        ? t('error_unavailable')
        : error === 'login'
          ? t('login_required')
          : error === 'network'
            ? t('error_network')
            : null;

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.btnPreview} onClick={generate}>
        {preview?.status === 'FAILED' ? t('retry') : t('cta')}
      </button>
      {preview?.status === 'FAILED' && !error && <p className={styles.error}>{t('failed')}</p>}
      {errorMessage && <p className={styles.error}>{errorMessage}</p>}
    </div>
  );
}
