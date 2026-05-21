'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useDashboardData } from '@/hooks/useDashboardData';
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
          <h1>{t('title')}</h1>
          <input
            type="text"
            className={styles.searchInput}
            placeholder={t('search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

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

        {loading ? (
          <div className={styles.loadingState}>{t('loading')}</div>
        ) : error ? (
          <div className={styles.emptyState}><p>{t('error')}</p></div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <p>{translations.length === 0 ? t('no_books') : t('no_books_hint')}</p>
            {translations.length === 0 && (
              <Link href="/search" className={styles.emptyBtn}>
                {t('start_search')}
              </Link>
            )}
          </div>
        ) : (
          <div className={styles.grid}>
            {filtered.map((item) => (
              <Link key={item.id} href={`/books/${item.book.id}`} className={styles.bookCard}>
                {item.book.coverUrl ? (
                  <Image
                    src={item.book.coverUrl}
                    alt={item.book.title}
                    width={140}
                    height={210}
                    className={styles.bookCover}
                    sizes="(max-width: 640px) 30vw, 140px"
                  />
                ) : (
                  <div className={styles.bookCoverPlaceholder}>
                    {item.book.title?.[0] || '?'}
                  </div>
                )}
                <div className={styles.bookInfo}>
                  <div className={styles.bookTitle}>{item.book.title}</div>
                  {item.book.author && (
                    <div className={styles.bookAuthor}>{item.book.author}</div>
                  )}
                  <span className={`${styles.statusBadge} ${item.status === 'COMPLETED' ? styles.completed : styles.inProgress}`}>
                    {item.status === 'COMPLETED' ? t('filter_completed') : `${Math.round(item.progress)}%`}
                  </span>
                  {item.status !== 'COMPLETED' && (
                    <div className={styles.progressContainer}>
                      <div className={styles.progressBar}>
                        <div className={styles.progressFill} style={{ width: `${item.progress}%` }} />
                      </div>
                      <span className={styles.progressText}>{Math.round(item.progress)}%</span>
                    </div>
                  )}
                  {item.status === 'COMPLETED' ? (
                    <span className={styles.readBtn}>
                      {t('read')}
                    </span>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
