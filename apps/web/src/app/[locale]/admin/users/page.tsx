'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAdminList } from '../useAdminList';
import Pagination from '../Pagination';
import styles from '../admin.module.scss';

interface AdminUser {
  id: string;
  email: string | null;
  name: string | null;
  role: 'USER' | 'ADMIN';
  emailVerified: string | null;
  locale: string | null;
  createdAt: string;
}

type ConfirmState =
  | { kind: 'role'; user: AdminUser; nextRole: 'USER' | 'ADMIN' }
  | null;

export default function AdminUsersPage() {
  const t = useTranslations('admin');
  const [actionError, setActionError] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
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
  } = useAdminList<AdminUser>({ endpoint: '/api/admin/users' });

  const requestRoleChange = (user: AdminUser) => {
    setConfirm({
      kind: 'role',
      user,
      nextRole: user.role === 'ADMIN' ? 'USER' : 'ADMIN',
    });
  };

  const performRoleChange = async () => {
    if (confirm?.kind !== 'role') return;
    const { user, nextRole } = confirm;
    setPendingId(user.id);
    setActionError('');
    try {
      const res = await apiFetch(`/api/admin/users/${user.id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!res.ok) throw new Error(await res.text());
      refresh();
      setConfirm(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('action_failed'));
    } finally {
      setPendingId(null);
    }
  };

  const verifyEmail = async (user: AdminUser) => {
    setPendingId(user.id);
    setActionError('');
    try {
      const res = await apiFetch(`/api/admin/users/${user.id}/verify-email`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('action_failed'));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div>
      <h1 className={styles.pageTitle}>{t('users_title')}</h1>

      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder={t('users_search_placeholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={refresh}
          disabled={loading}
        >
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
                <th className={styles.th}>{t('col_email')}</th>
                <th className={styles.th}>{t('col_name')}</th>
                <th className={styles.th}>{t('col_role')}</th>
                <th className={styles.th}>{t('col_verified')}</th>
                <th className={styles.th}>{t('col_created')}</th>
                <th className={styles.th}>{t('col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map(user => (
                <tr key={user.id} className={styles.tr}>
                  <td className={styles.td}>{user.email ?? '—'}</td>
                  <td className={styles.td}>{user.name ?? '—'}</td>
                  <td className={styles.td}>
                    <span className={`${styles.badge} ${user.role === 'ADMIN' ? styles.badgeInfo : styles.badgeNeutral}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className={styles.td}>
                    {user.emailVerified ? (
                      <span className={`${styles.badge} ${styles.badgeSuccess}`}>{t('verified')}</span>
                    ) : (
                      <span className={`${styles.badge} ${styles.badgeWarning}`}>{t('unverified')}</span>
                    )}
                  </td>
                  <td className={styles.td}>{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td className={styles.td}>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                        onClick={() => requestRoleChange(user)}
                        disabled={pendingId === user.id}
                      >
                        {user.role === 'ADMIN' ? t('demote') : t('promote')}
                      </button>
                      {!user.emailVerified && (
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => verifyEmail(user)}
                          disabled={pendingId === user.id}
                        >
                          {t('verify_email')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pageCount={pageCount} total={total} onPageChange={setPage} />

      <ConfirmDialog
        open={confirm?.kind === 'role'}
        title={t('confirm_role_change_title')}
        message={
          confirm?.kind === 'role'
            ? t('confirm_role_change', {
                email: confirm.user.email ?? confirm.user.id,
                role: confirm.nextRole,
              })
            : ''
        }
        variant={confirm?.kind === 'role' && confirm.nextRole === 'USER' ? 'danger' : 'default'}
        busy={pendingId !== null}
        onConfirm={performRoleChange}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
