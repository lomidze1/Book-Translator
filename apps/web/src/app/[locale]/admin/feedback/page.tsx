'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';
import { useAdminList } from '../useAdminList';
import Pagination from '../Pagination';
import GlossaryEditor from './GlossaryEditor';
import styles from '../admin.module.scss';

type FeedbackStatus = 'PENDING' | 'RETRANSLATING' | 'APPLIED' | 'REJECTED';

export interface AdminFeedback {
  id: string;
  status: FeedbackStatus;
  reportCount: number;
  selectedText: string;
  comment: string | null;
  createdAt: string;
  translation: {
    id: string;
    glossary: Record<string, string | { ka: string; type?: string; gender?: string }> | null;
    book: { id: string; title: string };
  };
  chapter: { number: number; title: string | null };
  user: { email: string };
}

const STATUSES: FeedbackStatus[] = ['PENDING', 'RETRANSLATING', 'APPLIED', 'REJECTED'];

function statusBadgeClass(status: FeedbackStatus): string {
  switch (status) {
    case 'APPLIED':
      return styles.badgeSuccess;
    case 'REJECTED':
      return styles.badgeDanger;
    case 'RETRANSLATING':
      return styles.badgeInfo;
    default:
      return styles.badgeWarning;
  }
}

export default function AdminFeedbackPage() {
  const t = useTranslations('admin');
  const [status, setStatus] = useState<string>('');
  const [actionError, setActionError] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [glossaryTarget, setGlossaryTarget] = useState<AdminFeedback | null>(null);

  const extraQuery = useMemo(() => ({ status: status || undefined }), [status]);

  const { items, page, setPage, search, setSearch, loading, error, refresh, pageCount, total } =
    useAdminList<AdminFeedback>({ endpoint: '/api/admin/feedback', extraQuery });

  const retry = async (id: string) => {
    setPendingId(id);
    setActionError('');
    try {
      const res = await apiFetch(`/api/admin/feedback/${id}/retry`, { method: 'POST' });
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
      <h1 className={styles.pageTitle}>{t('feedback_title')}</h1>
      <p className={styles.statSubvalue}>{t('feedback_intro')}</p>

      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder={t('feedback_search_placeholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.filterSelect}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">{t('filter_all_statuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="button" className={styles.refreshBtn} onClick={refresh} disabled={loading}>
          {t('refresh')}
        </button>
      </div>

      {actionError && <div className={styles.errorBanner}>{actionError}</div>}
      {error && <div className={styles.errorBanner}>{error}</div>}

      {loading ? (
        <div className={styles.loadingState}>{t('loading')}</div>
      ) : items.length === 0 ? (
        <div className={styles.emptyState}>{t('no_results')}</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>{t('col_reported_text')}</th>
                <th className={styles.th}>{t('col_book')}</th>
                <th className={styles.th}>{t('col_reports')}</th>
                <th className={styles.th}>{t('col_status')}</th>
                <th className={styles.th}>{t('col_created')}</th>
                <th className={styles.th}>{t('col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((fb) => (
                <tr key={fb.id} className={styles.tr}>
                  <td className={styles.td}>
                    <blockquote className={styles.reportedText}>{fb.selectedText}</blockquote>
                    {fb.comment && <p className={styles.reportComment}>“{fb.comment}”</p>}
                    <p className={styles.statSubvalue}>{fb.user.email}</p>
                  </td>
                  <td className={styles.td}>
                    <strong>{fb.translation.book.title}</strong>
                    <p className={styles.statSubvalue}>
                      {t('chapter_n', { number: fb.chapter.number })}
                    </p>
                  </td>
                  <td className={styles.td}>
                    {/* Several readers on one passage is the strongest signal */}
                    <span className={fb.reportCount > 1 ? styles.reportCountHot : ''}>
                      ×{fb.reportCount}
                    </span>
                  </td>
                  <td className={styles.td}>
                    <span className={`${styles.badge} ${statusBadgeClass(fb.status)}`}>
                      {fb.status}
                    </span>
                  </td>
                  <td className={styles.td}>{new Date(fb.createdAt).toLocaleDateString()}</td>
                  <td className={styles.td}>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => setGlossaryTarget(fb)}
                    >
                      {t('edit_glossary')}
                    </button>
                    <button
                      type="button"
                      className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                      onClick={() => void retry(fb.id)}
                      disabled={pendingId === fb.id || fb.status === 'RETRANSLATING'}
                    >
                      {pendingId === fb.id ? t('loading') : t('retry')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pageCount={pageCount} total={total} onPageChange={setPage} />

      {glossaryTarget && (
        <GlossaryEditor
          feedback={glossaryTarget}
          onClose={() => setGlossaryTarget(null)}
          onSaved={() => {
            setGlossaryTarget(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
