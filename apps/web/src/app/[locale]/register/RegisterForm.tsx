'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import styles from '../../register/page.module.scss';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

type Step = 'form' | 'loading' | 'verify' | 'exists';

function getInitialStep(searchParams: URLSearchParams): Step {
  const s = searchParams.get('step');
  if (s === 'verify' || s === 'exists') return s;
  return 'form';
}

export default function RegisterPage() {
  const t = useTranslations('register');
  const searchParams = useSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [step, setStep] = useState<Step>(() => getInitialStep(searchParams));
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendSent, setResendSent] = useState(false);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateStep = useCallback((newStep: Step) => {
    setStep(newStep);
    const url = new URL(window.location.href);
    if (newStep === 'form' || newStep === 'loading') {
      url.searchParams.delete('step');
      url.searchParams.delete('email');
    } else {
      url.searchParams.set('step', newStep);
      if (email) url.searchParams.set('email', email);
    }
    window.history.replaceState({}, '', url.toString());
  }, [email]);

  useEffect(() => {
    return () => {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const validateField = (field: string, value: string): string => {
    switch (field) {
      case 'name':
        if (!value.trim()) return t('error_name_required');
        if (value.trim().length < 3) return t('error_name_min');
        if (!/^[\p{L}\s]+$/u.test(value.trim())) return t('error_name_letters');
        return '';
      case 'email':
        if (!value.trim()) return t('error_email_required');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return t('error_email_format');
        return '';
      case 'password':
        if (value.length < 8) return t('error_password_min');
        if (!/(?=.*[A-Z])(?=.*\d)/.test(value)) return t('error_password_strength');
        return '';
      case 'confirmPassword':
        if (!value) return t('error_confirm_required');
        if (value !== password) return t('error_password_mismatch');
        return '';
      default:
        return '';
    }
  };

  const handleBlur = (field: string, value: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const error = validateField(field, value);
    setFieldErrors((prev) => ({ ...prev, [field]: error }));
  };

  const handleChange = (field: string, value: string, setter: (v: string) => void) => {
    setter(value);
    if (touched[field]) {
      const error = validateField(field, value);
      setFieldErrors((prev) => ({ ...prev, [field]: error }));
    }
    if (field === 'password' && touched['confirmPassword'] && confirmPassword) {
      const confirmError = value !== confirmPassword ? t('error_password_mismatch') : '';
      setFieldErrors((prev) => ({ ...prev, confirmPassword: confirmError }));
    }
  };

  const inputClassName = (field: string) => {
    if (!touched[field]) return styles.input;
    if (fieldErrors[field]) return `${styles.input} ${styles.inputError}`;
    return `${styles.input} ${styles.inputValid}`;
  };

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0) return;
    setResendSent(false);
    try {
      await fetch(`${API_URL}/api/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setResendSent(true);
      setResendCooldown(60);
    } catch {
      // silently fail
    }
  }, [email, resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');

    const errors: Record<string, string> = {
      name: validateField('name', name),
      email: validateField('email', email),
      password: validateField('password', password),
      confirmPassword: validateField('confirmPassword', confirmPassword),
    };

    setFieldErrors(errors);
    setTouched({ name: true, email: true, password: true, confirmPassword: true });

    if (Object.values(errors).some((e) => e !== '')) return;

    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409 && data.message === 'EMAIL_ALREADY_EXISTS') {
          updateStep('exists');
          return;
        }
        if (res.status === 429) {
          setServerError(t('error_rate_limit'));
        } else {
          setServerError(t('error_default'));
        }
        return;
      }

      // Show loading step with progress bar, then verify step
      setStep('loading');
      loadingTimerRef.current = setTimeout(() => {
        updateStep('verify');
      }, 3000);
    } catch {
      setServerError(t('error_server'));
    } finally {
      setLoading(false);
    }
  };

  // Step: Loading with progress bar
  if (step === 'loading') {
    return (
      <div className={styles.container}>
        <div className={styles.formCard}>
          <h1 className={styles.title}>{t('title')}</h1>
          <p className={styles.success}>{t('success_loading')}</p>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} />
          </div>
        </div>
      </div>
    );
  }

  // Step: Email already exists
  if (step === 'exists') {
    return (
      <div className={styles.container}>
        <div className={styles.formCard}>
          <div className={styles.verifyScreen}>
            <h2 className={styles.verifyTitle}>{t('error_email_exists')}</h2>
            <p className={styles.verifySubtitle}>{t('error_email_exists_hint')}</p>

            <Link href="/forgot-password" className={styles.submitBtn} style={{ display: 'block', width: '100%', textAlign: 'center', textDecoration: 'none' }}>
              {t('reset_password')}
            </Link>

            <Link href="/" className={styles.secondaryBtn}>
              {t('back_home')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Step: Verify email
  if (step === 'verify') {
    return (
      <div className={styles.container}>
        <div className={styles.formCard}>
          <div className={styles.verifyScreen}>
            <div className={styles.verifyIcon}>
              <CheckIcon />
            </div>
            <h2 className={styles.verifyTitle}>{t('success')}</h2>
            <p className={styles.verifySubtitle}>{t('success_verify')}</p>

            <a
              href="https://mail.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.submitBtn}
            >
              {t('open_email')}
            </a>

            <Link href="/" className={styles.secondaryBtn}>
              {t('back_home')}
            </Link>

            <div className={styles.resendRow}>
              {resendSent && <span className={styles.resendSent}>{t('resend_sent')}</span>}
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0}
                className={styles.resendLink}
              >
                {resendCooldown > 0
                  ? t('resend_cooldown', { seconds: resendCooldown })
                  : t('resend_verification')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step: Registration form
  return (
    <div className={styles.container}>
      <div className={styles.formCard}>
        <h1 className={styles.title}>{t('title')}</h1>

        {serverError && <p className={styles.error} role="alert">{serverError}</p>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            {t('name')}
            <input
              type="text"
              value={name}
              onChange={(e) => handleChange('name', e.target.value, setName)}
              onBlur={() => handleBlur('name', name)}
              placeholder={t('name_placeholder')}
              autoComplete="name"
              className={inputClassName('name')}
            />
            {touched.name && fieldErrors.name && (
              <span className={styles.fieldError}>{fieldErrors.name}</span>
            )}
          </label>

          <label className={styles.label}>
            {t('email')}
            <input
              type="email"
              value={email}
              onChange={(e) => handleChange('email', e.target.value, setEmail)}
              onBlur={() => handleBlur('email', email)}
              placeholder="you@example.com"
              autoComplete="email"
              className={inputClassName('email')}
            />
            {touched.email && fieldErrors.email && (
              <span className={styles.fieldError}>{fieldErrors.email}</span>
            )}
          </label>

          <label className={styles.label}>
            {t('password')}
            <div className={styles.inputWrapper}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => handleChange('password', e.target.value, setPassword)}
                onBlur={() => handleBlur('password', password)}
                placeholder={t('password_placeholder')}
                autoComplete="new-password"
                className={`${inputClassName('password')} ${styles.inputWithIcon}`}
              />
              <button
                type="button"
                className={styles.eyeButton}
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? t('hide_password') : t('show_password')}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {touched.password && fieldErrors.password && (
              <span className={styles.fieldError}>{fieldErrors.password}</span>
            )}
          </label>

          <label className={styles.label}>
            {t('confirm_password')}
            <div className={styles.inputWrapper}>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => handleChange('confirmPassword', e.target.value, setConfirmPassword)}
                onBlur={() => handleBlur('confirmPassword', confirmPassword)}
                placeholder={t('confirm_placeholder')}
                autoComplete="new-password"
                className={`${inputClassName('confirmPassword')} ${styles.inputWithIcon}`}
              />
              <button
                type="button"
                className={styles.eyeButton}
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                tabIndex={-1}
                aria-label={showConfirmPassword ? t('hide_password') : t('show_password')}
              >
                {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {touched.confirmPassword && fieldErrors.confirmPassword && (
              <span className={styles.fieldError}>{fieldErrors.confirmPassword}</span>
            )}
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
