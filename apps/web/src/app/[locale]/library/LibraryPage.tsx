'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useDashboardData } from '@/hooks/useDashboardData';
import Skeleton from '@/components/Skeleton';
import styles from './library.module.scss';

type Filter = 'all' | 'in_progress' | 'completed';

export default function LibraryPage() {
  const t = useTranslations('library');
  const { translations, loading, error } = useDashboardData();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let items = translations;

    if (filter === 'completed') {
      items = items.filter((item) => item.status === 'COMPLETED');
    } else if (filter === 'in_progress') {
      items = items.filter((item) => item.status !== 'COMPLETED' && item.status !== 'FAILED');
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (item) => item.book.title.toLowerCase().includes(q) ||
                  item.book.author?.toLowerCase().includes(q),
      );
    }

    return items;
  }, [translations, filter, search]);

  return (
    <ProtectedRoute>
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1>{t('title')}</h1>
            <div className={styles.meta}>
              {t('meta', { books: translations.length })}
            </div>
          </div>
          <Link href="/upload" className={styles.newBtn}>
            {t('new_book')}
          </Link>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.filters}>
          {(['all', 'in_progress', 'completed'] as const).map((f) => (
            <button
              key={f}
              className={`${styles.filterTab} ${filter === f ? styles.active : ''}`}
              onClick={() => setFilter(f)}
            >
              {t(`filter_${f}`)}
            </button>
          ))}
          </div>
          <input
            type="text"
            className={styles.searchInput}
            placeholder={t('search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          // Skeleton rows that mirror the real table layout so the page
          // doesn't reflow when data arrives.
          <div className={styles.grid} aria-busy="true" aria-live="polite">
            <span className="sr-only">{t('loading')}</span>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={styles.row}>
                <Skeleton variant="image" height={84} />
                <div>
                  <Skeleton variant="text" width="70%" />
                  <Skeleton variant="text" width="40%" />
                </div>
                <Skeleton variant="text" width="100%" height={8} />
                <Skeleton variant="text" width={80} />
                <Skeleton variant="text" width={90} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className={styles.emptyState}><p>{t('error')}</p></div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyState}>
            {translations.length === 0 ? (
              <>
                <p>{t('no_books')}</p>
                <p className={styles.emptyHint}>{t('no_books_hint')}</p>
                <Link href="/search" className={styles.emptyBtn}>
                  {t('start_search')}
                </Link>
              </>
            ) : (
              // User has books but the current filter / search hides them all.
              // Tell them how to recover rather than repeating the empty copy.
              <>
                <p>{t('no_matches')}</p>
                <p className={styles.emptyHint}>{t('no_matches_hint')}</p>
              </>
            )}
          </div>
        ) : (
          // Ruled table: cover · title/author · progress · status · action.
          <div className={styles.grid}>
            {filtered.map((item) => {
              const done = item.status === 'COMPLETED';
              return (
                <Link key={item.id} href={`/books/${item.book.id}`} className={styles.row}>
                  <div className={`${styles.cover} grayscale`}>
                    {item.book.coverUrl ? (
                      <Image
                        src={item.book.coverUrl}
                        alt=""
                        width={56}
                        height={84}
                        className={styles.bookCover}
                        sizes="56px"
                      />
                    ) : (
                      <span className={styles.bookCoverPlaceholder}>
                        {item.book.title?.[0] || '?'}
                      </span>
                    )}
                  </div>

                  <div className={styles.cellTitle}>
                    <div className={styles.bookTitle}>{item.book.title}</div>
                    {item.book.author && (
                      <div className={styles.bookAuthor}>{item.book.author}</div>
                    )}
                  </div>

                  <div className={styles.cellProgress}>
                    <div className={styles.progressBar}>
                      <div
                        className={`${styles.progressFill} ${done ? styles.progressDone : ''}`}
                        style={{ width: `${done ? 100 : item.progress}%` }}
                      />
                    </div>
                    <div className={styles.progressText}>
                      {done ? t('filter_completed') : `${Math.round(item.progress)}%`}
                    </div>
                  </div>

                  <div className={styles.cellStatus}>
                    {done ? t('status_translated') : t('filter_in_progress')}
                  </div>

                  <span className={`${styles.action} ${done ? styles.actionAccent : ''}`}>
                    {done ? t('read') : t('waiting')}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
