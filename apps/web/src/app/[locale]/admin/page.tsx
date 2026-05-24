'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiJson } from '@/lib/api-client';
import styles from './admin.module.scss';

interface Stats {
  users: number;
  books: number;
  translations: { completed: number; failed: number; inProgress: number };
  revenue: number;
}

export default function AdminDashboardPage() {
  const t = useTranslations('admin');
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiJson<Stats>('/api/admin/stats');
        if (!cancelled) setStats(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('load_error'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <div>
      <h1 className={styles.pageTitle}>{t('dashboard_title')}</h1>

      {error && <div className={styles.errorBanner}>{error}</div>}
      {loading && <div className={styles.loadingState}>{t('loading')}</div>}

      {stats && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>{t('stats_users')}</p>
            <p className={styles.statValue}>{stats.users.toLocaleString()}</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>{t('stats_books')}</p>
            <p className={styles.statValue}>{stats.books.toLocaleString()}</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>{t('stats_translations')}</p>
            <p className={styles.statValue}>{stats.translations.completed.toLocaleString()}</p>
            <p className={styles.statSubvalue}>
              {t('stats_in_progress_count', { count: stats.translations.inProgress })}
              {' · '}
              {t('stats_failed_count', { count: stats.translations.failed })}
            </p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>{t('stats_revenue')}</p>
            <p className={styles.statValue}>
              {stats.revenue.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} ₾
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
