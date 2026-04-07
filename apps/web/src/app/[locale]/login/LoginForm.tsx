'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import styles from '../../login/page.module.scss';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function LoginPage() {
  const t = useTranslations('login');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendSuccess, setResendSuccess] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const validate = (): boolean => {
    if (!email.trim()) {
      setError(t('email_required'));
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t('email_invalid'));
      return false;
    }
    if (!password || password.length < 8) {
      setError(t('password_min'));
      return false;
    }
    return true;
  };

  const handleResendVerification = useCallback(async () => {
    if (resendCooldown > 0) return;
    setResendSuccess(false);

    try {
      await fetch(`${API_URL}/api/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setResendSuccess(true);
      setResendCooldown(60);
    } catch {
      // Silently fail — user can retry
    }
  }, [email, resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setEmailNotVerified(false);
    setResendSuccess(false);

    if (!validate()) return;

    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403 && data.message === 'EMAIL_NOT_VERIFIED') {
          setEmailNotVerified(true);
          return;
        }
        if (res.status === 401) {
          setError(t('error_credentials'));
        } else if (res.status === 429 || data.message?.includes('Too many')) {
          setError(t('error_rate_limit'));
        } else {
          setError(t('error_default'));
        }
        return;
      }

      login(data.accessToken, data.refreshToken, data.user);

      // Redirect to returnUrl if present and safe (relative path only)
      const returnUrl = searchParams.get('returnUrl');
      if (returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//')) {
        router.push(returnUrl);
      } else {
        router.push('/dashboard');
      }
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

        {error && <p className={styles.error} role="alert">{error}</p>}

        {emailNotVerified && (
          <div className={styles.verificationNotice} role="alert">
            <p>{t('email_not_verified')}</p>
            {resendSuccess && (
              <p className={styles.verificationSent}>{t('verification_sent')}</p>
            )}
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resendCooldown > 0}
              className={styles.resendBtn}
            >
              {resendCooldown > 0
                ? t('resend_cooldown', { seconds: resendCooldown })
                : t('resend_verification')}
            </button>
          </div>
        )}

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

          <label className={styles.label}>
            {t('password')}
            <div className={styles.passwordWrapper}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('password_placeholder')}
                required
                minLength={8}
                autoComplete="current-password"
                className={styles.input}
              />
              <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? t('hide_password') : t('show_password')}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </label>

          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading ? t('loading') : t('submit')}
          </button>
        </form>

        {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
          <>
            <div className={styles.divider}>
              <span>{t('or_divider')}</span>
            </div>
            <GoogleSignInButton
              onError={(msg) => setError(msg)}
              redirectTo={
                (() => {
                  const returnUrl = searchParams.get('returnUrl');
                  return returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//')
                    ? returnUrl
                    : '/dashboard';
                })()
              }
            />
          </>
        )}

        <p className={styles.forgotLink}>
          <Link href="/forgot-password">{t('forgot_password')}</Link>
        </p>

        <p className={styles.switchLink}>
          {t('no_account')}{' '}
          <Link href="/register">{t('register_link')}</Link>
        </p>
      </div>
    </div>
  );
}
