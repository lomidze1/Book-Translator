'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import styles from '../reader.module.scss';

interface Props {
  selectedText: string;
  remaining: number | null;
  onSubmit: (comment: string) => Promise<void>;
  onClose: () => void;
}

/**
 * "This reads wrong" — the reader's half of the quality loop. The comment is
 * optional on purpose: the friction of explaining what's wrong is exactly what
 * stops people from reporting at all.
 */
export default function ReportTranslationModal({ selectedText, remaining, onSubmit, onClose }: Props) {
  const t = useTranslations('reader');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(comment.trim());
      setDone(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('RETRANSLATION_QUOTA_EXCEEDED')) setError(t('report_quota_exceeded'));
      else if (message.includes('FEEDBACK_RATE_LIMIT')) setError(t('report_rate_limited'));
      else setError(t('report_failed'));
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.modalBackdrop} onMouseDown={onClose}>
      <div
        className={styles.reportModal}
        role="dialog"
        aria-modal="true"
        aria-label={t('report_title')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {done ? (
          <>
            <h3>{t('report_thanks_title')}</h3>
            <p className={styles.reportHint}>{t('report_thanks_body')}</p>
            <div className={styles.reportActions}>
              <button className={styles.reportSubmit} onClick={onClose}>
                {t('close')}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3>{t('report_title')}</h3>
            <p className={styles.reportHint}>{t('report_intro')}</p>

            <blockquote className={styles.reportQuote}>{selectedText}</blockquote>

            <label className={styles.reportLabel} htmlFor="report-comment">
              {t('report_comment_label')}
            </label>
            <textarea
              id="report-comment"
              className={styles.reportTextarea}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder={t('report_comment_placeholder')}
              disabled={submitting}
            />

            {remaining !== null && (
              <p className={styles.reportHint}>{t('report_remaining', { count: remaining })}</p>
            )}
            {error && <p className={styles.reportError}>{error}</p>}

            <div className={styles.reportActions}>
              <button className={styles.reportCancel} onClick={onClose} disabled={submitting}>
                {t('cancel')}
              </button>
              <button className={styles.reportSubmit} onClick={handleSubmit} disabled={submitting}>
                {submitting ? t('report_sending') : t('report_send')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
