'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useDashboardData } from '@/hooks/useDashboardData';
import styles from './dashboard.module.scss';

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const { user } = useAuth();
  const { stats, recentActivity, loading, error } = useDashboardData();

  const today = new Date().toLocaleDateString(locale === 'ka' ? 'ka-GE' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <ProtectedRoute>
      <div className={styles.container}>
        {/* Greeting */}
        <div className={styles.greeting}>
          <h1>{t('greeting', { name: user?.name || '' })}</h1>
          <p className={styles.date}>{today}</p>
        </div>

        {loading ? (
          <div className={styles.loadingState}>{t('loading')}</div>
        ) : error ? (
          <div className={styles.emptyState}>{t('error')}</div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <div className={styles.statNumber}>{stats.totalBooks}</div>
                <div className={styles.statLabel}>{t('stats_books')}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statNumber}>{stats.inProgress}</div>
                <div className={styles.statLabel}>{t('stats_in_progress')}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statNumber}>{stats.completed}</div>
                <div className={styles.statLabel}>{t('stats_completed')}</div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className={styles.section}>
              <h2>{t('recent_activity')}</h2>
              {recentActivity.length === 0 ? (
                <div className={styles.emptyState}>{t('no_activity')}</div>
              ) : (
                <ul className={styles.activityList}>
                  {recentActivity.map((item) => (
                    <li key={item.id} className={styles.activityItem}>
                      {item.book.coverUrl ? (
                        <img src={item.book.coverUrl} alt={item.book.title} className={styles.activityCover} />
                      ) : (
                        <div className={styles.activityCoverPlaceholder}>
                          {item.book.title?.[0] || '?'}
                        </div>
                      )}
                      <div className={styles.activityInfo}>
                        <div className={styles.activityTitle}>{item.book.title}</div>
                        <div className={styles.activityStatus}>
                          {item.status === 'COMPLETED'
                            ? t('translation_completed')
                            : t('translation_progress', { percentage: Math.round(item.progress) })}
                        </div>
                      </div>
                      {item.status === 'COMPLETED' && (
                        <Link href={`/books/${item.book.id}/read`} className={styles.activityAction}>
                          {t('continue_reading')}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Quick Actions */}
            <div className={styles.section}>
              <h2>{t('quick_actions')}</h2>
              <div className={styles.quickActions}>
                <Link href="/search" className={styles.actionBtn}>
                  {t('search_books')}
                </Link>
                <Link href="/upload" className={styles.actionBtn}>
                  {t('upload_book')}
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
