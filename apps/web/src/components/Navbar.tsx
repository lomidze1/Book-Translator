'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
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
  const pathname = usePathname();
  const { user, isLoggedIn, isLoading, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile drawer on route change. usePathname is the cheapest
  // signal here — react-router-level navigation always updates it.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open so the page underneath doesn't
  // scroll when the user is panning inside the drawer.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  // Active-route indicator: strip the locale prefix and compare the remainder.
  const isActive = (href: string) => {
    const stripped = pathname.replace(/^\/(ka|en)/, '') || '/';
    return stripped === href;
  };

  return (
    <nav className={styles.navbar} aria-label="Main navigation">
      <div className={styles.container}>
        <Link href="/" className={styles.logo}>
          Book Translator
        </Link>

        {/* Desktop nav — hidden under the mobile breakpoint. */}
        <div className={styles.desktopLinks}>
          <Link
            href="/search"
            className={`${styles.navLink} ${isActive('/search') ? styles.navLinkActive : ''}`}
          >
            {t('search')}
          </Link>
          <Link
            href="/upload"
            className={`${styles.navLink} ${isActive('/upload') ? styles.navLinkActive : ''}`}
          >
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
                  userRole={user?.role}
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

        {/* Mobile compact bar: bell + avatar trigger + hamburger. */}
        <div className={styles.mobileBar}>
          {!isLoading && isLoggedIn && <NotificationBell />}
          <button
            type="button"
            className={styles.menuBtn}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-drawer"
            aria-label={menuOpen ? t('close_menu') : t('open_menu')}
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            <span className={styles.menuBar} />
            <span className={styles.menuBar} />
            <span className={styles.menuBar} />
          </button>
        </div>
      </div>

      {/* Mobile drawer + backdrop. Backdrop closes the drawer on tap. */}
      {menuOpen && (
        <div
          className={styles.drawerBackdrop}
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        id="mobile-nav-drawer"
        className={`${styles.drawer} ${menuOpen ? styles.drawerOpen : ''}`}
        aria-hidden={!menuOpen}
      >
        <div className={styles.drawerInner}>
          <Link
            href="/search"
            className={`${styles.drawerLink} ${isActive('/search') ? styles.drawerLinkActive : ''}`}
          >
            {t('search')}
          </Link>
          <Link
            href="/upload"
            className={`${styles.drawerLink} ${isActive('/upload') ? styles.drawerLinkActive : ''}`}
          >
            {t('upload')}
          </Link>

          <div className={styles.drawerControls}>
            <ThemeSwitcher />
            <LanguageSwitcher />
          </div>

          {!isLoading && (
            isLoggedIn ? (
              <div className={styles.drawerUserBlock}>
                <UserDropdown
                  userName={user?.name || null}
                  userEmail={user?.email || null}
                  userRole={user?.role}
                  onLogout={handleLogout}
                />
              </div>
            ) : (
              <div className={styles.drawerAuth}>
                <Link href="/login" className={styles.loginBtn}>
                  {t('login')}
                </Link>
                <Link href="/register" className={styles.registerBtn}>
                  {t('register')}
                </Link>
              </div>
            )
          )}
        </div>
      </aside>
    </nav>
  );
}
