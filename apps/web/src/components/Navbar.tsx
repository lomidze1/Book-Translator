'use client';

import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeSwitcher from './ThemeSwitcher';
import UserDropdown from './UserDropdown';
import NotificationBell from './NotificationBell';
import styles from './Navbar.module.scss';

export default function Navbar() {
  const t = useTranslations('navbar');
  const router = useRouter();
  const { user, isLoggedIn, isLoading, logout } = useAuth();

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <nav className={styles.navbar} aria-label="Main navigation">
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
              <NotificationBell />
              <UserDropdown
                userName={user?.name || null}
                userEmail={user?.email || null}
                onLogout={handleLogout}
              />
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
