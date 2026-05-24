'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import styles from './PasswordStrengthMeter.module.scss';

interface PasswordStrengthMeterProps {
  password: string;
  /**
   * Hide the requirements checklist (just show the strength bar). Useful for
   * dense forms; defaults to false (show everything).
   */
  hideChecklist?: boolean;
}

interface Requirement {
  key: 'length' | 'uppercase' | 'lowercase' | 'digit';
  met: boolean;
}

/**
 * Live password strength feedback. The bar and the requirements checklist
 * update on every keystroke so the user knows what's missing before they
 * blur the input. The scoring is intentionally simple (not zxcvbn) — the
 * server-side rule is just "8+ chars, 1 uppercase, 1 digit", and we mirror
 * that plus a few extras for a 0–4 bar.
 */
export default function PasswordStrengthMeter({
  password,
  hideChecklist = false,
}: PasswordStrengthMeterProps) {
  const t = useTranslations('register');

  const { score, label, requirements } = useMemo(() => {
    const requirements: Requirement[] = [
      { key: 'length', met: password.length >= 8 },
      { key: 'uppercase', met: /[A-Z]/.test(password) },
      { key: 'lowercase', met: /[a-z]/.test(password) },
      { key: 'digit', met: /\d/.test(password) },
    ];

    // Base score: how many of the 4 mandatory checks pass.
    let s = requirements.filter((r) => r.met).length;
    // Length bonus: a long passphrase counts above the minimum bar.
    if (password.length >= 12) s = Math.min(4, s + 1);
    if (password.length >= 16) s = Math.min(4, s + 1);
    // Empty input → score 0 regardless of bonus.
    if (password.length === 0) s = 0;

    const labelKey =
      password.length === 0
        ? null
        : s <= 1
          ? 'strength_weak'
          : s === 2
            ? 'strength_fair'
            : s === 3
              ? 'strength_good'
              : 'strength_strong';

    return { score: s, label: labelKey, requirements };
  }, [password]);

  if (password.length === 0) return null;

  return (
    <div className={styles.wrapper} aria-live="polite">
      <div
        className={styles.bar}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={score}
        aria-label={label ? t(label) : undefined}
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`${styles.segment} ${i < score ? styles[`level${score}`] : ''}`}
          />
        ))}
      </div>

      {label && (
        <p className={`${styles.label} ${styles[`label${score}`] ?? ''}`}>
          {t(label)}
        </p>
      )}

      {!hideChecklist && (
        <ul className={styles.checklist}>
          {requirements.map((req) => (
            <li
              key={req.key}
              className={req.met ? styles.met : styles.unmet}
            >
              <span aria-hidden="true">{req.met ? '✓' : '○'}</span>
              {t(`requirement_${req.key}`)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
