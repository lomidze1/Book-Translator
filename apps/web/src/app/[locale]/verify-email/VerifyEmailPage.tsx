'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import styles from '../../verify-email/page.module.scss';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function CheckIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

export default function VerifyEmailPage() {
  const t = useTranslations('verify_email');
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'verifying' | 'success' | 'already' | 'error'>(token ? 'verifying' : 'error');

  useEffect(() => {
    if (!token) return;

    fetch(`${API_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setStatus('error');
        } else if (data.message === 'Email already verified') {
          setStatus('already');
        } else {
          setStatus('success');
        }
      })
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('title')}</h1>

        {status === 'verifying' && (
          <p className={styles.verifying}>{t('verifying')}</p>
        )}

        {status === 'success' && (
          <div className={styles.successBox}>
            <div className={styles.successIcon}>
              <CheckIcon />
            </div>
            <p className={styles.successTitle}>{t('success')}</p>
            <p className={styles.successSubtitle}>{t('success_thanks')}</p>
            <Link href="/login" className={styles.primaryBtn}>
              {t('go_to_login')}
            </Link>
            <Link href="/" className={styles.secondaryBtn}>
              {t('go_home')}
            </Link>
          </div>
        )}

        {status === 'already' && (
          <div className={styles.infoBox}>
            <p>{t('already_verified')}</p>
            <Link href="/login" className={styles.link}>
              {t('go_to_login')}
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div className={styles.errorBox}>
            <p>{t('error_invalid_token')}</p>
            <Link href="/login" className={styles.link}>
              {t('go_to_login')}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
