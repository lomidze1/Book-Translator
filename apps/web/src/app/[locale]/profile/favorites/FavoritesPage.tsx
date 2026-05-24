'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { useRouter, Link } from '@/i18n/navigation';
import Breadcrumbs from '@/components/Breadcrumbs';
import styles from '../subpage.module.scss';

export default function FavoritesPage() {
  const t = useTranslations('profile');
  const { isLoggedIn, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      router.push('/');
    }
  }, [isLoading, isLoggedIn, router]);

  if (isLoading || !isLoggedIn) {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <Breadcrumbs
          items={[
            { label: t('profile'), href: '/profile' },
            { label: t('my_favorites') },
          ]}
        />
        <Link href="/profile" className={styles.backLink}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t('back_to_profile')}
        </Link>

        <h1 className={styles.title}>{t('my_favorites')}</h1>

        <div className={styles.emptyState}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <p>{t('no_favorites')}</p>
          <Link href="/search" className={styles.emptyAction}>
            {t('browse_books')}
          </Link>
        </div>
      </div>
    </div>
  );
}
