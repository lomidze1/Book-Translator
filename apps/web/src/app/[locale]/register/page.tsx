'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import styles from '../../register/page.module.scss';

export default function RegisterPage() {
  const t = useTranslations('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError(t('error_password_mismatch'));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || t('error_default'));
        return;
      }

      setSuccess(t('success'));
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
        {success && <p className={styles.success}>{success}</p>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            {t('name')}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('name_placeholder')}
              className={styles.input}
            />
          </label>

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

          <label className={styles.label}>
            {t('confirm_password')}
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('confirm_placeholder')}
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
          {t('has_account')}{' '}
          <Link href="/login">{t('login_link')}</Link>
        </p>
      </div>
    </div>
  );
}
