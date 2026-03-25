'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import styles from '../../login/page.module.scss';

export default function LoginPage() {
  const t = useTranslations('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || t('error_default'));
        return;
      }

      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      window.location.href = '/';
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

        {error && <p className={styles.error}>{error}</p>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            {t('email')}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className={styles.input}
            />
          </label>

          <label className={styles.label}>
            {t('password')}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('password_placeholder')}
              required
              minLength={8}
              className={styles.input}
            />
          </label>

          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading ? t('loading') : t('submit')}
          </button>
        </form>

        <p className={styles.switchLink}>
          {t('no_account')}{' '}
          <Link href="/register">{t('register_link')}</Link>
        </p>
      </div>
    </div>
  );
}
