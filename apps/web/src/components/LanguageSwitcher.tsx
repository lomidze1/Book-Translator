'use client';

import { useLocale } from 'next-intl';
import { usePathname } from '@/i18n/navigation';
import styles from './LanguageSwitcher.module.scss';

export default function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();

  const switchLocale = (newLocale: 'ka' | 'en') => {
    const search = window.location.search;
    const hash = window.location.hash;
    window.location.href = `/${newLocale}${pathname}${search}${hash}`;
  };

  return (
    <div className={styles.switcher}>
      <button
        className={`${styles.btn} ${locale === 'ka' ? styles.active : ''}`}
        onClick={() => switchLocale('ka')}
        aria-label="ქართული ენა"
        aria-current={locale === 'ka' ? 'true' : undefined}
      >
        ქარ
      </button>
      <span className={styles.divider}>|</span>
      <button
        className={`${styles.btn} ${locale === 'en' ? styles.active : ''}`}
        onClick={() => switchLocale('en')}
        aria-label="English language"
        aria-current={locale === 'en' ? 'true' : undefined}
      >
        Eng
      </button>
    </div>
  );
}
