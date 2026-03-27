'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import styles from '../../register/page.module.scss';

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

export default function RegisterPage() {
  const t = useTranslations('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    setSuccess('');

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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await res.json();

      if (!res.ok) {
        setServerError(data.message || t('error_default'));
        return;
      }

      setSuccess(t('success'));
      setName('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setFieldErrors({});
      setTouched({});
      successTimerRef.current = setTimeout(() => {
        setSuccess('');
      }, 5000);
    } catch {
      setServerError(t('error_server'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.formCard}>
        <h1 className={styles.title}>{t('title')}</h1>

        {serverError && <p className={styles.error}>{serverError}</p>}
        {success && (
          <>
            <p className={styles.success}>{success}</p>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            {t('name')}
            <input
              type="text"
              value={name}
              onChange={(e) => handleChange('name', e.target.value, setName)}
              onBlur={() => handleBlur('name', name)}
              placeholder={t('name_placeholder')}
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
