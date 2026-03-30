'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { useRouter, Link } from '@/i18n/navigation';
import styles from '../subpage.module.scss';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function ChangePasswordPage() {
  const t = useTranslations('profile');
  const { isLoggedIn, isLoading } = useAuth();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      router.push('/');
    }
  }, [isLoading, isLoggedIn, router]);

  if (isLoading || !isLoggedIn) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    if (newPassword !== confirmPassword) {
      setMessage(t('password_mismatch'));
      setIsError(true);
      return;
    }

    setSaving(true);
    const token = localStorage.getItem('accessToken');

    try {
      const res = await fetch(`${API_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed');
      }

      setMessage(t('password_changed'));
      setIsError(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('update_error'));
      setIsError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <Link href="/profile" className={styles.backLink}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t('back_to_profile')}
        </Link>

        <h1 className={styles.title}>{t('change_password')}</h1>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formField}>
            <label>{t('current_password')}</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>

          <div className={styles.formField}>
            <label>{t('new_password')}</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          <p className={styles.hint}>{t('password_requirements')}</p>

          <div className={styles.formField}>
            <label>{t('confirm_password')}</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {message && (
            <p className={`${styles.message} ${isError ? styles.error : styles.success}`}>
              {message}
            </p>
          )}

          <button type="submit" disabled={saving} className={styles.submitBtn}>
            {saving ? '...' : t('change_password')}
          </button>
        </form>
      </div>
    </div>
  );
}
