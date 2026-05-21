'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { useRouter, Link } from '@/i18n/navigation';
import styles from '../subpage.module.scss';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface PaymentItem {
  id: string;
  amount: string;
  currency: string;
  status: string;
  type: string;
  provider: string;
  description: string;
  paidAt: string | null;
  createdAt: string;
}

interface PaymentsResponse {
  payments: PaymentItem[];
  total: number;
  page: number;
  limit: number;
}

export default function PaymentsPage() {
  const t = useTranslations('profile');
  const { isLoggedIn, isLoading } = useAuth();
  const router = useRouter();
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const limit = 10;

  const fetchPayments = useCallback(async (pageNum: number) => {
    setLoading(true);
    setError(null);
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(
        `${API_URL}/api/payments/history?page=${pageNum}&limit=${limit}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (res.status === 401) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('cachedUser');
        throw new Error('Unauthorized');
      }

      if (!res.ok) throw new Error('Failed to fetch');

      const data: PaymentsResponse = await res.json();
      setPayments(data.payments);
      setTotal(data.total);
      setPage(data.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      router.push('/');
      return;
    }
    if (isLoggedIn) {
      fetchPayments(1);
    }
  }, [isLoading, isLoggedIn, router, fetchPayments]);

  if (isLoading || !isLoggedIn) {
    return null;
  }

  const totalPages = Math.ceil(total / limit);

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return styles.statusCompleted;
      case 'PROCESSING':
        return styles.statusInProgress;
      case 'FAILED':
        return styles.statusFailed;
      case 'REFUNDED':
        return styles.statusRefunded;
      default:
        return styles.statusPending;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ka-GE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatAmount = (amount: string, currency: string) => {
    const num = parseFloat(amount);
    if (currency === 'GEL') {
      return `${num.toFixed(2)} ₾`;
    }
    return `${num.toFixed(2)} ${currency}`;
  };

  return (
    <div className={styles.container}>
      <div className={`${styles.card} ${styles.cardWide}`}>
        <Link href="/profile" className={styles.backLink}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t('back_to_profile')}
        </Link>

        <h1 className={styles.title}>{t('my_payments')}</h1>

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

        {!loading && !error && payments.length === 0 && (
          <div className={styles.emptyState}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            <p>{t('no_payments')}</p>
            <Link href="/search" className={styles.emptyAction}>
              {t('start_translating')}
            </Link>
          </div>
        )}

        {!loading && !error && payments.length > 0 && (
          <>
            <div className={styles.paymentsList}>
              {payments.map((item) => (
                <div key={item.id} className={styles.paymentItem}>
                  <div className={styles.paymentMain}>
                    <div className={styles.paymentIcon}>
                      <span className={styles.providerFlitt}>Flitt</span>
                    </div>
                    <div className={styles.paymentInfo}>
                      <p className={styles.paymentDesc}>{item.description}</p>
                      <span className={styles.paymentDate}>
                        {formatDate(item.paidAt || item.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className={styles.paymentRight}>
                    <span className={styles.paymentAmount}>
                      {formatAmount(item.amount, item.currency)}
                    </span>
                    <span className={`${styles.statusBadge} ${getStatusClass(item.status)}`}>
                      {t(`payment_status_${item.status}`)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className={styles.pagination}>
                <button
                  onClick={() => fetchPayments(page - 1)}
                  disabled={page <= 1}
                  className={styles.pageBtn}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <span className={styles.pageInfo}>
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => fetchPayments(page + 1)}
                  disabled={page >= totalPages}
                  className={styles.pageBtn}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
