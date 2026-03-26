'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeSwitcher from './ThemeSwitcher';
import styles from './Navbar.module.scss';

export default function Navbar() {
  const t = useTranslations('navbar');
  const { user, isLoggedIn, isLoading, logout } = useAuth();

  const handleLogout = () => {
    logout();
    window.location.href = '/';
  };

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
          {!isLoading && (
            isLoggedIn ? (
              <>
                <Link href="/profile" className={styles.profileBtn}>
                  {user?.name || t('profile')}
                </Link>
                <button onClick={handleLogout} className={styles.logoutBtn}>
                  {t('logout')}
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className={styles.loginBtn}>
                  {t('login')}
                </Link>
                <Link href="/register" className={styles.registerBtn}>
                  {t('register')}
                </Link>
              </>
            )
          )}
        </div>
      </div>
    </nav>
  );
}
