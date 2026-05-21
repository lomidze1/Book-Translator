'use client';

import { useLocale } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import styles from './LanguageSwitcher.module.scss';

/**
 * Locale switcher rendered as real `<a>` links so search engines (and Google's
 * hreflang discovery in particular) can follow each language version. The
 * previous implementation used `window.location.href` from a button click,
 * which is invisible to crawlers.
 */
export default function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <div className={styles.switcher}>
      <Link
        href={pathname}
        locale="ka"
        className={`${styles.btn} ${locale === 'ka' ? styles.active : ''}`}
        aria-label="ქართული ენა"
        aria-current={locale === 'ka' ? 'true' : undefined}
        hrefLang="ka"
      >
        ქარ
      </Link>
      <span className={styles.divider}>|</span>
      <Link
        href={pathname}
        locale="en"
        className={`${styles.btn} ${locale === 'en' ? styles.active : ''}`}
        aria-label="English language"
        aria-current={locale === 'en' ? 'true' : undefined}
        hrefLang="en"
      >
        Eng
      </Link>
    </div>
  );
}
