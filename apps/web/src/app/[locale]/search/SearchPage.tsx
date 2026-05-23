'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import Image from 'next/image';
import Skeleton from '@/components/Skeleton';
import styles from '../../search/page.module.scss';

interface ExternalBook {
  source: 'google' | 'openlibrary';
  title: string;
  author?: string;
  description?: string;
  isbn?: string;
  coverUrl?: string;
  language?: string;
  pageCount?: number;
  googleBooksId?: string;
  openLibraryId?: string;
  inDatabase?: boolean;
  translationAvailable?: boolean;
  databaseBookId?: string;
}

interface DatabaseBook {
  id: string;
  title: string;
  author?: string;
  coverUrl?: string;
  translations: { id: string; targetLanguage: string }[];
}

interface SearchResult {
  external: ExternalBook[];
  database: DatabaseBook[];
  total: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function SearchPage() {
  const t = useTranslations('search');
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);

    try {
      const res = await fetch(`${API_URL}/api/books/search?q=${encodeURIComponent(q)}&limit=20`);
      if (res.ok) {
        const data: SearchResult = await res.json();
        setResults(data);
      }
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-execute when the URL carries a ?q= param. Powers Google's sitelinks
  // searchbox (declared via the WebSite/SearchAction JSON-LD in the layout).
  useEffect(() => {
    if (initialQuery.trim()) {
      search(initialQuery);
    }
    // Only on initial mount — subsequent searches are user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      search(query);
    }
  };

  return (
    <div className={styles.main}>
      <div className={styles.container}>
          <h1 className={styles.title}>{t('title')}</h1>
          <p className={styles.subtitle}>{t('subtitle')}</p>

          <div className={styles.searchBox}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder={t('placeholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            <button
              className={styles.searchButton}
              onClick={() => search(query)}
              disabled={loading || query.length < 2}
            >
              {loading ? t('searching') : t('button')}
            </button>
          </div>

          {loading && !results && (
            // Initial search — show a skeleton grid until results arrive.
            // For subsequent searches the previous results stay visible
            // (handled by the existing button "searching..." state).
            <section className={styles.section} aria-busy="true" aria-live="polite">
              <span className="sr-only">{t('searching')}</span>
              <h2 className={styles.sectionTitle}>
                <Skeleton variant="title" width={180} />
              </h2>
              <div className={styles.grid}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className={styles.card}>
                    <Skeleton variant="image" height={192} />
                    <div className={styles.cardInfo}>
                      <Skeleton variant="text" width="85%" />
                      <Skeleton variant="text" width="55%" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {results?.database && results.database.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('section_database')}</h2>
              <div className={styles.grid}>
                {results.database.map((book) => (
                  <Link href={`/books/${book.id}`} key={book.id} className={styles.card}>
                    <div className={styles.cardCover}>
                      {book.coverUrl ? (
                        <Image src={book.coverUrl} alt={book.title} width={128} height={192} style={{ objectFit: 'cover' }} />
                      ) : (
                        <div className={styles.noCover}>📚</div>
                      )}
                    </div>
                    <div className={styles.cardInfo}>
                      <h3 className={styles.cardTitle}>{book.title}</h3>
                      {book.author && <p className={styles.cardAuthor}>{book.author}</p>}
                      {book.translations.length > 0 && (
                        <span className={styles.badgeTranslated}>{t('badge_translated')}</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {results?.external && results.external.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                {t('section_online', { count: results.external.length })}
              </h2>
              <div className={styles.grid}>
                {results.external.map((book, i) => (
                  <div key={`${book.source}-${book.isbn || i}`} className={styles.card}>
                    <div className={styles.cardCover}>
                      {book.coverUrl ? (
                        <Image src={book.coverUrl} alt={book.title} width={128} height={192} style={{ objectFit: 'cover' }} />
                      ) : (
                        <div className={styles.noCover}>📖</div>
                      )}
                    </div>
                    <div className={styles.cardInfo}>
                      <h3 className={styles.cardTitle}>{book.title}</h3>
                      {book.author && <p className={styles.cardAuthor}>{book.author}</p>}
                      {book.description && (
                        <p className={styles.cardDesc}>
                          {book.description.substring(0, 120)}...
                        </p>
                      )}
                      <div className={styles.cardMeta}>
                        {book.pageCount && <span>{book.pageCount} {t('pages_short')}</span>}
                        <span className={styles.source}>
                          {book.source === 'google' ? 'Google Books' : 'Open Library'}
                        </span>
                      </div>
                      {book.inDatabase && (
                        <Link
                          href={`/books/${book.databaseBookId}`}
                          className={styles.badgeInDb}
                        >
                          {book.translationAvailable ? t('badge_georgian') : t('badge_english')}
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {searched && !loading && results?.total === 0 && (
            <div className={styles.noResults}>
              <p>{t('no_results')}</p>
            </div>
          )}
      </div>
    </div>
  );
}
