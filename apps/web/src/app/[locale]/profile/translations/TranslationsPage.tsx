'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { useRouter, Link } from '@/i18n/navigation';
import { useDashboardData } from '@/hooks/useDashboardData';
import Breadcrumbs from '@/components/Breadcrumbs';
import styles from '../subpage.module.scss';

export default function TranslationsPage() {
  const t = useTranslations('profile');
  const { isLoggedIn, isLoading } = useAuth();
  const router = useRouter();
  const { translations, loading, error } = useDashboardData();

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      router.push('/');
    }
  }, [isLoading, isLoggedIn, router]);

  if (isLoading || !isLoggedIn) {
    return null;
  }

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return styles.statusCompleted;
      case 'IN_PROGRESS':
        return styles.statusInProgress;
      case 'FAILED':
        return styles.statusFailed;
      case 'PAID':
        return styles.statusPaid;
      default:
        return styles.statusPending;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ka-GE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className={styles.container}>
      <div className={`${styles.card} ${styles.cardWide}`}>
        <Breadcrumbs
          items={[
            { label: t('profile'), href: '/profile' },
            { label: t('my_translations') },
          ]}
        />
        <Link href="/profile" className={styles.backLink}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t('back_to_profile')}
        </Link>

        <h1 className={styles.title}>{t('my_translations')}</h1>

        {loading && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>{t('loading')}</p>
          </div>
        )}

        {error && (
          <div className={`${styles.message} ${styles.error}`}>
            {t('load_error')}
          </div>
        )}

        {!loading && !error && translations.length === 0 && (
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
        )}

        {!loading && !error && translations.length > 0 && (
          <div className={styles.translationsList}>
            {translations.map((item) => (
              <div key={item.id} className={styles.translationItem}>
                <div className={styles.translationCover}>
                  {item.book.coverUrl ? (
                    <Image
                      src={item.book.coverUrl}
                      alt={item.book.title}
                      width={48}
                      height={72}
                    />
                  ) : (
                    <div className={styles.coverPlaceholder}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                    </div>
                  )}
                </div>

                <div className={styles.translationInfo}>
                  <h3 className={styles.translationTitle}>{item.book.title}</h3>
                  {item.book.author && (
                    <p className={styles.translationAuthor}>{item.book.author}</p>
                  )}

                  <div className={styles.translationMeta}>
                    <span className={`${styles.statusBadge} ${getStatusClass(item.status)}`}>
                      {t(`translation_status_${item.status}`)}
                    </span>
                    <span className={styles.metaDate}>{formatDate(item.createdAt)}</span>
                  </div>

                  {(item.status === 'IN_PROGRESS' || item.status === 'PAID') && (
                    <div className={styles.progressContainer}>
                      <div className={styles.progressBar}>
                        <div
                          className={styles.progressFill}
                          style={{ width: `${Math.round(item.progress)}%` }}
                        />
                      </div>
                      <span className={styles.progressText}>
                        {Math.round(item.progress)}%
                      </span>
                    </div>
                  )}
                </div>

                <div className={styles.translationActions}>
                  {item.status === 'COMPLETED' && (
                    <Link
                      href={`/books/${item.book.id}/read`}
                      className={styles.readBtn}
                    >
                      {t('read_book')}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
