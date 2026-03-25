'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeSwitcher from './ThemeSwitcher';
import styles from './Navbar.module.scss';

export default function Navbar() {
  const t = useTranslations('navbar');

  return (
    <nav className={styles.navbar}>
      <div className={styles.container}>
        <Link href="/" className={styles.logo}>
          Book Translator
        </Link>
        <div className={styles.links}>
          <Link href="/search" className={styles.navLink}>
            {t('search')}
          </Link>
          <Link href="/upload" className={styles.navLink}>
            {t('upload')}
          </Link>
          <ThemeSwitcher />
          <LanguageSwitcher />
          <Link href="/login" className={styles.loginBtn}>
            {t('login')}
          </Link>
          <Link href="/register" className={styles.registerBtn}>
            {t('register')}
          </Link>
        </div>
      </div>
    </nav>
  );
}
