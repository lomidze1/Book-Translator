'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiJson } from '@/lib/api-client';
import styles from './admin.module.scss';

interface Stats {
  generatedAt: string;
  users: { total: number; new7d: number; new30d: number; active30d: number; verified: number };
  books: { total: number; new30d: number };
  translations: {
    total: number;
    completed: number;
    completed30d: number;
    failed: number;
    inProgress: number;
    pending: number;
    stuck: number;
    avgMinutes: number | null;
  };
  revenue: {
    allTime: number;
    gross30d: number;
    refunded30d: number;
    net30d: number;
    last7d: number;
    currency: string;
  };
  payments: { completed30d: number; failed30d: number; pending: number; conversionRate: number };
  quality: {
    scoredTranslations: number;
    avgScore: number | null;
    chaptersChecked: number;
    chaptersFlagged: number;
    flagCounts: Record<string, number>;
    feedback: Record<string, number>;
  };
  cost: {
    tokensAllTime: number;
    tokens30d: number;
    usdAllTime: number;
    usd30d: number;
    blendedUsdPerMTok: number;
    approximate: boolean;
  };
  queue: { waiting: number; active: number; failed: number } | null;
}

const num = (value: number) => value.toLocaleString();
const money = (value: number) =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Card({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'danger' | 'warning';
}) {
  const toneClass =
    tone === 'danger' ? styles.statCardDanger : tone === 'warning' ? styles.statCardWarning : '';
  return (
    <div className={`${styles.statCard} ${toneClass}`}>
      <p className={styles.statLabel}>{label}</p>
      <p className={styles.statValue}>{value}</p>
      {sub && <p className={styles.statSubvalue}>{sub}</p>}
    </div>
  );
}

export default function AdminDashboardPage() {
  const t = useTranslations('admin');
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setStats(await apiJson<Stats>('/api/admin/stats'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('load_error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Anything counted here means work is stuck rather than merely queued
  const blockers = stats
    ? stats.translations.stuck + stats.translations.failed + (stats.queue?.failed ?? 0)
    : 0;

  return (
    <div>
      <div className={styles.toolbar}>
        <h1 className={styles.pageTitle}>{t('dashboard_title')}</h1>
        <button className={styles.refreshBtn} onClick={() => void load()} disabled={loading}>
          {loading ? t('loading') : t('refresh')}
        </button>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}
      {loading && !stats && <div className={styles.loadingState}>{t('loading')}</div>}

      {stats && (
        <>
          <p className={styles.statSubvalue}>
            {t('as_of')} {new Date(stats.generatedAt).toLocaleString()}
          </p>

          {blockers > 0 && (
            <div className={styles.blockerBanner}>{t('blockers_banner', { count: blockers })}</div>
          )}

          <h2 className={styles.sectionTitle}>{t('section_users')}</h2>
          <div className={styles.statsGrid}>
            <Card
              label={t('stats_users')}
              value={num(stats.users.total)}
              sub={t('verified_count', { count: stats.users.verified })}
            />
            <Card label={t('users_new7d')} value={num(stats.users.new7d)} />
            <Card label={t('users_new30d')} value={num(stats.users.new30d)} />
            <Card
              label={t('users_active30d')}
              value={num(stats.users.active30d)}
              sub={t('mau_proxy')}
            />
          </div>

          <h2 className={styles.sectionTitle}>{t('section_funnel')}</h2>
          <div className={styles.statsGrid}>
            <Card
              label={t('stats_books')}
              value={num(stats.books.total)}
              sub={t('new30d_sub', { count: stats.books.new30d })}
            />
            <Card
              label={t('translations_total')}
              value={num(stats.translations.total)}
              sub={t('completed30d_sub', { count: stats.translations.completed30d })}
            />
            <Card label={t('translations_completed')} value={num(stats.translations.completed)} />
            <Card
              label={t('translations_avg_time')}
              value={
                stats.translations.avgMinutes === null
                  ? '—'
                  : t('minutes', { count: stats.translations.avgMinutes })
              }
            />
          </div>

          <h2 className={styles.sectionTitle}>{t('section_blockers')}</h2>
          <div className={styles.statsGrid}>
            <Card
              label={t('translations_stuck')}
              value={num(stats.translations.stuck)}
              sub={t('stuck_hint')}
              tone={stats.translations.stuck > 0 ? 'danger' : undefined}
            />
            <Card
              label={t('translations_failed')}
              value={num(stats.translations.failed)}
              tone={stats.translations.failed > 0 ? 'warning' : undefined}
            />
            <Card
              label={t('translations_in_progress')}
              value={num(stats.translations.inProgress)}
              sub={t('pending_sub', { count: stats.translations.pending })}
            />
            <Card
              label={t('queue_depth')}
              value={stats.queue ? num(stats.queue.waiting) : '—'}
              sub={
                stats.queue
                  ? t('queue_sub', { active: stats.queue.active, failed: stats.queue.failed })
                  : t('queue_unavailable')
              }
              tone={stats.queue && stats.queue.failed > 0 ? 'warning' : undefined}
            />
          </div>

          <h2 className={styles.sectionTitle}>{t('section_quality')}</h2>
          <div className={styles.statsGrid}>
            <Card
              label={t('quality_score')}
              value={stats.quality.avgScore === null ? '—' : `${stats.quality.avgScore.toFixed(2)} / 5`}
              sub={
                stats.quality.avgScore === null
                  ? t('quality_judge_off')
                  : t('scored_count', { count: stats.quality.scoredTranslations })
              }
            />
            <Card
              label={t('quality_flagged')}
              value={`${num(stats.quality.chaptersFlagged)} / ${num(stats.quality.chaptersChecked)}`}
              sub={t('quality_flagged_sub')}
              tone={stats.quality.chaptersFlagged > 0 ? 'warning' : undefined}
            />
            <Card
              label={t('feedback_pending')}
              value={num(stats.quality.feedback.PENDING ?? 0)}
              sub={t('feedback_sub', {
                applied: stats.quality.feedback.APPLIED ?? 0,
                rejected: stats.quality.feedback.REJECTED ?? 0,
              })}
            />
            <Card label={t('feedback_total')} value={num(stats.quality.feedback.total ?? 0)} />
          </div>

          {Object.keys(stats.quality.flagCounts).length > 0 && (
            <div className={styles.flagList}>
              {Object.entries(stats.quality.flagCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([flag, count]) => (
                  <span key={flag} className={`${styles.badge} ${styles.badgeWarning}`}>
                    {flag} · {count}
                  </span>
                ))}
            </div>
          )}

          <h2 className={styles.sectionTitle}>{t('section_money')}</h2>
          <div className={styles.statsGrid}>
            <Card
              label={t('revenue_net30d')}
              value={`${money(stats.revenue.net30d)} ₾`}
              sub={t('gross_refunded_sub', {
                gross: money(stats.revenue.gross30d),
                refunded: money(stats.revenue.refunded30d),
              })}
            />
            <Card label={t('revenue_last7d')} value={`${money(stats.revenue.last7d)} ₾`} />
            <Card label={t('revenue_all_time')} value={`${money(stats.revenue.allTime)} ₾`} />
            <Card
              label={t('conversion_rate')}
              value={`${stats.payments.conversionRate}%`}
              sub={t('conversion_sub')}
            />
          </div>

          <div className={styles.statsGrid}>
            <Card
              label={t('cost_30d')}
              value={`$${money(stats.cost.usd30d)}`}
              sub={t('cost_approx', { rate: stats.cost.blendedUsdPerMTok })}
            />
            <Card
              label={t('cost_all_time')}
              value={`$${money(stats.cost.usdAllTime)}`}
              sub={t('tokens_sub', { tokens: num(stats.cost.tokensAllTime) })}
            />
            <Card
              label={t('payments_pending')}
              value={num(stats.payments.pending)}
              tone={stats.payments.pending > 0 ? 'warning' : undefined}
            />
            <Card label={t('payments_failed30d')} value={num(stats.payments.failed30d)} />
          </div>

          <p className={styles.statSubvalue}>{t('cost_disclaimer')}</p>
        </>
      )}
    </div>
  );
}
