'use client';

import { useEffect, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link, useRouter } from '@/i18n/navigation';
import styles from '../profile/subpage.module.scss';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function CheckIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

type Status = 'loading' | 'success' | 'error';

export default function ConfirmPasswordChangePage() {
  const t = useTranslations('confirm_password_change');
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const calledRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!token || calledRef.current) return;
    calledRef.current = true;

    const confirmChange = async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/confirm-password-change`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (res.status === 400 || res.status === 410) {
            setErrorMessage(t('error_invalid'));
          } else {
            setErrorMessage(data.message || t('error_default'));
          }
          setStatus('error');
          return;
        }

        setStatus('success');
        timeoutRef.current = setTimeout(() => {
          router.push('/profile');
        }, 3000);
      } catch {
        setErrorMessage(t('error_default'));
        setStatus('error');
      }
    };

    confirmChange();
  }, [token, t, router]);

  if (!token) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.emailSentScreen}>
            <div className={styles.emailSentIcon} style={{ color: '#ef4444' }}>
              <ErrorIcon />
            </div>
            <h2 className={styles.emailSentTitle}>{t('title')}</h2>
            <p className={styles.emailSentDescription}>{t('error_invalid')}</p>
            <Link href="/profile" className={styles.emailBtn}>
              {t('back_to_profile')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>{t('confirming')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.emailSentScreen}>
            <div className={styles.emailSentIcon} style={{ color: '#22c55e' }}>
              <CheckIcon />
            </div>
            <h2 className={styles.emailSentTitle}>{t('success')}</h2>
            <p className={styles.emailSentDescription}>{t('redirecting')}</p>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ animation: 'none', width: '100%', transition: 'width 3s linear' }} />
            </div>
            <Link href="/profile" className={styles.secondaryLink}>
              {t('back_to_profile')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // status === 'error'
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.emailSentScreen}>
          <div className={styles.emailSentIcon} style={{ color: '#ef4444' }}>
            <ErrorIcon />
          </div>
          <h2 className={styles.emailSentTitle}>{t('title')}</h2>
          <p className={styles.emailSentDescription}>{errorMessage}</p>
          <Link href="/profile/change-password" className={styles.emailBtn}>
            {t('try_again')}
          </Link>
          <Link href="/profile" className={styles.secondaryLink}>
            {t('back_to_profile')}
          </Link>
        </div>
      </div>
    </div>
  );
}
