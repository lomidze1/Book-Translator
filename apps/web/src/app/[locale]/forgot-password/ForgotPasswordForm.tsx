'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import styles from '../../forgot-password/page.module.scss';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function ForgotPasswordPage() {
  const t = useTranslations('forgot_password');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setError(t('error_rate_limit'));
        } else {
          setError(data.message || t('error_default'));
        }
        return;
      }

      setSuccess(true);
    } catch {
      setError(t('error_server'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.formCard}>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.subtitle}>{t('subtitle')}</p>

        {success ? (
          <div className={styles.successBox}>
            <p>{t('success')}</p>
            <a
              href="https://mail.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.emailBtn}
            >
              {t('open_email')}
            </a>
            <Link href="/" className={styles.backLink}>
              {t('back_home')}
            </Link>
          </div>
        ) : (
          <>
            {error && <p className={styles.error} role="alert">{error}</p>}

            <form onSubmit={handleSubmit} className={styles.form}>
              <label className={styles.label}>
                {t('email')}
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  className={styles.input}
                />
              </label>

              <button type="submit" disabled={loading} className={styles.submitBtn}>
                {loading ? t('loading') : t('submit')}
              </button>
            </form>

            <p className={styles.switchLink}>
              <Link href="/login">{t('back_to_login')}</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
