'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import styles from './LanguageSwitcher.module.scss';

export default function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const switchLocale = (newLocale: 'ka' | 'en') => {
    router.replace(pathname, { locale: newLocale });
  };

  return (
    <div className={styles.switcher}>
      <button
        className={`${styles.btn} ${locale === 'ka' ? styles.active : ''}`}
        onClick={() => switchLocale('ka')}
      >
        ქარ
      </button>
      <span className={styles.divider}>|</span>
      <button
        className={`${styles.btn} ${locale === 'en' ? styles.active : ''}`}
        onClick={() => switchLocale('en')}
      >
        Eng
      </button>
    </div>
  );
}
