'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { useRouter, Link } from '@/i18n/navigation';
import styles from '../subpage.module.scss';

export default function TranslationsPage() {
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
        <Link href="/profile" className={styles.backLink}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t('back_to_profile')}
        </Link>

        <h1 className={styles.title}>{t('my_translations')}</h1>

        <div className={styles.emptyState}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            <line x1="8" y1="7" x2="16" y2="7" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
          <p>{t('no_translations')}</p>
          <Link href="/search" className={styles.emptyAction}>
            {t('start_translating')}
          </Link>
        </div>
      </div>
    </div>
  );
}
