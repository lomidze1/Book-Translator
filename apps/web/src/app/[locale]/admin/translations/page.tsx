'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';
import { useAdminList } from '../useAdminList';
import Pagination from '../Pagination';
import styles from '../admin.module.scss';

interface AdminTranslation {
  id: string;
  status: 'PENDING' | 'PAID' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  translationType: 'FAST' | 'STANDARD';
  progress: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  book: { id: string; title: string; author: string | null };
}

const STATUSES = ['PENDING', 'PAID', 'IN_PROGRESS', 'COMPLETED', 'FAILED'] as const;

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'COMPLETED':
      return styles.badgeSuccess;
    case 'FAILED':
      return styles.badgeDanger;
    case 'IN_PROGRESS':
      return styles.badgeInfo;
    case 'PAID':
      return styles.badgeWarning;
    default:
      return styles.badgeNeutral;
  }
}

export default function AdminTranslationsPage() {
  const t = useTranslations('admin');
  const [status, setStatus] = useState<string>('');
  const [actionError, setActionError] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);

  const extraQuery = useMemo(() => ({ status: status || undefined }), [status]);

  const {
    items,
    page,
    setPage,
    search,
    setSearch,
    loading,
    error,
    refresh,
    pageCount,
    total,
  } = useAdminList<AdminTranslation>({ endpoint: '/api/admin/translations', extraQuery });

  const onRetry = async (translation: AdminTranslation) => {
    if (!window.confirm(t('confirm_retry', { title: translation.book.title }))) return;
    setPendingId(translation.id);
    setActionError('');
    try {
      const res = await apiFetch(`/api/admin/translations/${translation.id}/retry`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || (await res.text()));
      }
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('action_failed'));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div>
      <h1 className={styles.pageTitle}>{t('translations_title')}</h1>

      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder={t('translations_search_placeholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className={styles.filterSelect}
          value={status}
          onChange={e => setStatus(e.target.value)}
        >
          <option value="">{t('filter_all_statuses')}</option>
          {STATUSES.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {actionError && <div className={styles.errorBanner}>{actionError}</div>}
      {error && <div className={styles.errorBanner}>{error}</div>}

      {loading ? (
        <div className={styles.loadingState}>{t('loading')}</div>
      ) : items.length === 0 ? (
        <div className={styles.emptyState}>{t('no_results')}</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>{t('col_book')}</th>
              <th className={styles.th}>{t('col_status')}</th>
              <th className={styles.th}>{t('col_progress')}</th>
              <th className={styles.th}>{t('col_type')}</th>
              <th className={styles.th}>{t('col_created')}</th>
              <th className={styles.th}>{t('col_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map(tr => (
              <tr key={tr.id} className={styles.tr}>
                <td className={styles.td}>
                  <strong>{tr.book.title}</strong>
                  {tr.book.author && <div style={{ fontSize: 12, color: '#64748b' }}>{tr.book.author}</div>}
                </td>
                <td className={styles.td}>
                  <span className={`${styles.badge} ${statusBadgeClass(tr.status)}`}>{tr.status}</span>
                </td>
                <td className={styles.td}>{Math.round(tr.progress)}%</td>
                <td className={styles.td}>{tr.translationType}</td>
                <td className={styles.td}>{new Date(tr.createdAt).toLocaleDateString()}</td>
                <td className={styles.td}>
                  {(tr.status === 'FAILED' || tr.status === 'IN_PROGRESS') && (
                    <button
                      type="button"
                      className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                      onClick={() => onRetry(tr)}
                      disabled={pendingId === tr.id}
                    >
                      {t('retry')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination page={page} pageCount={pageCount} total={total} onPageChange={setPage} />
    </div>
  );
}
