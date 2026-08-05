'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname, Link } from '@/i18n/navigation';
import styles from './admin.module.scss';

const NAV_ITEMS = [
  { href: '/admin', key: 'dashboard' },
  { href: '/admin/users', key: 'users' },
  { href: '/admin/translations', key: 'translations' },
  { href: '/admin/feedback', key: 'feedback' },
  { href: '/admin/payments', key: 'payments' },
] as const;

export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const t = useTranslations('admin');
  const { user, isLoggedIn, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Bounce non-admins. Done in an effect so SSR-rendered children don't
  // briefly flash for users without permission.
  useEffect(() => {
    if (isLoading) return;
    if (!isLoggedIn || user?.role !== 'ADMIN') {
      router.replace('/');
    }
  }, [isLoading, isLoggedIn, user, router]);

  if (isLoading || !isLoggedIn || user?.role !== 'ADMIN') {
    return null;
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <h2 className={styles.brand}>{t('title')}</h2>
        <nav className={styles.nav}>
          {NAV_ITEMS.map(item => {
            const active = item.href === '/admin' ? pathname === '/admin' : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}
              >
                {t(`nav_${item.key}`)}
              </Link>
            );
          })}
        </nav>
      </aside>
      <section className={styles.main}>{children}</section>
    </div>
  );
}
