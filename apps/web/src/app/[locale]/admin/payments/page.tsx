'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminList } from '../useAdminList';
import Pagination from '../Pagination';
import styles from '../admin.module.scss';

interface AdminPayment {
  id: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  type: string;
  provider: string;
  description: string | null;
  paidAt: string | null;
  createdAt: string;
  user: { id: string; email: string | null; name: string | null };
}

const STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'] as const;

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'COMPLETED':
      return styles.badgeSuccess;
    case 'FAILED':
      return styles.badgeDanger;
    case 'REFUNDED':
      return styles.badgeWarning;
    case 'PROCESSING':
      return styles.badgeInfo;
    default:
      return styles.badgeNeutral;
  }
}

export default function AdminPaymentsPage() {
  const t = useTranslations('admin');
  const [status, setStatus] = useState<string>('');

  const extraQuery = useMemo(() => ({ status: status || undefined }), [status]);

  const { items, page, setPage, search, setSearch, loading, error, refresh, pageCount, total } =
    useAdminList<AdminPayment>({ endpoint: '/api/admin/payments', extraQuery });

  return (
    <div>
      <h1 className={styles.pageTitle}>{t('payments_title')}</h1>

      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder={t('payments_search_placeholder')}
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
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={refresh}
          disabled={loading}
        >
          {t('refresh')}
        </button>
      </div>

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
              <th className={styles.th}>{t('col_user')}</th>
              <th className={styles.th}>{t('col_amount')}</th>
              <th className={styles.th}>{t('col_status')}</th>
              <th className={styles.th}>{t('col_type')}</th>
              <th className={styles.th}>{t('col_provider')}</th>
              <th className={styles.th}>{t('col_paid_at')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map(p => (
              <tr key={p.id} className={styles.tr}>
                <td className={styles.td}>
                  <strong>{p.user.email ?? p.user.name ?? p.user.id}</strong>
                  {p.user.name && p.user.email && (
                    <div style={{ fontSize: 12, color: '#64748b' }}>{p.user.name}</div>
                  )}
                </td>
                <td className={styles.td}>
                  {p.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{' '}
                  {p.currency === 'GEL' ? '₾' : p.currency}
                </td>
                <td className={styles.td}>
                  <span className={`${styles.badge} ${statusBadgeClass(p.status)}`}>{p.status}</span>
                </td>
                <td className={styles.td}>{p.type}</td>
                <td className={styles.td}>{p.provider}</td>
                <td className={styles.td}>
                  {p.paidAt ? new Date(p.paidAt).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <Pagination page={page} pageCount={pageCount} total={total} onPageChange={setPage} />
    </div>
  );
}
