'use client';

import { useTranslations } from 'next-intl';
import styles from './AuthAside.module.scss';

/**
 * The accent panel that sits beside the sign-in / sign-up forms: what you get,
 * as four ruled rows. Shared so both auth surfaces stay identical.
 */
export default function AuthAside() {
  const t = useTranslations('auth');

  return (
    <aside className={styles.aside}>
      <div className={styles.eyebrow}>{t('aside_eyebrow')}</div>
      <div>
        <div className={styles.statement}>{t('aside_statement')}</div>
        <div className={styles.benefits}>
          {(['1', '2', '3', '4'] as const).map((n) => (
            <div key={n} className={styles.benefit}>
              {t(`aside_benefit_${n}`)}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
