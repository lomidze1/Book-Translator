'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import styles from '../../verify-email/page.module.scss';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function VerifyEmailPage() {
  const t = useTranslations('verify_email');
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'verifying' | 'success' | 'already' | 'error'>('verifying');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }

    fetch(`${API_URL}/api/auth/verify-email?token=${token}`)
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
            <p>{t('success')}</p>
            <Link href="/login" className={styles.link}>
              {t('go_to_login')}
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
