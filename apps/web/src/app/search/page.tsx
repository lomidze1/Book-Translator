'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import styles from './page.module.scss';

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
  const [query, setQuery] = useState('');
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

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults(null);
      setSearched(false);
      return;
    }

    const timer = setTimeout(() => search(query), 500);
    return () => clearTimeout(timer);
  }, [query, search]);

  return (
    <div className={styles.main}>
      <div className={styles.container}>
          <h1 className={styles.title}>წიგნის ძებნა</h1>
          <p className={styles.subtitle}>
            მოძებნე ინგლისურენოვანი წიგნი სახელით, ავტორით ან ISBN-ით
          </p>

          <div className={styles.searchBox}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="მაგ: Clean Code, Robert Martin, 978-0132350884..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <button
              className={styles.searchButton}
              onClick={() => search(query)}
              disabled={loading || query.length < 2}
            >
              {loading ? 'ძებნა...' : 'ძებნა'}
            </button>
          </div>

          {/* Database results */}
          {results?.database && results.database.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>ჩვენს ბაზაში</h2>
              <div className={styles.grid}>
                {results.database.map((book) => (
                  <Link href={`/books/${book.id}`} key={book.id} className={styles.card}>
                    <div className={styles.cardCover}>
                      {book.coverUrl ? (
                        <img src={book.coverUrl} alt={book.title} />
                      ) : (
                        <div className={styles.noCover}>📚</div>
                      )}
                    </div>
                    <div className={styles.cardInfo}>
                      <h3 className={styles.cardTitle}>{book.title}</h3>
                      {book.author && <p className={styles.cardAuthor}>{book.author}</p>}
                      {book.translations.length > 0 && (
                        <span className={styles.badgeTranslated}>ქართული თარგმანი ✓</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* External results */}
          {results?.external && results.external.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                ნაპოვნია ონლაინ ({results.external.length})
              </h2>
              <div className={styles.grid}>
                {results.external.map((book, i) => (
                  <div key={`${book.source}-${book.isbn || i}`} className={styles.card}>
                    <div className={styles.cardCover}>
                      {book.coverUrl ? (
                        <img src={book.coverUrl} alt={book.title} />
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
                        {book.pageCount && <span>{book.pageCount} გვ.</span>}
                        <span className={styles.source}>
                          {book.source === 'google' ? 'Google Books' : 'Open Library'}
                        </span>
                      </div>
                      {book.inDatabase && (
                        <Link
                          href={`/books/${book.databaseBookId}`}
                          className={styles.badgeInDb}
                        >
                          {book.translationAvailable
                            ? 'ქართული — 5₾'
                            : 'ინგლისური — 1$'}
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* No results */}
          {searched && !loading && results?.total === 0 && (
            <div className={styles.noResults}>
              <p>წიგნი ვერ მოიძებნა. სცადე სხვა საძიებო სიტყვა.</p>
            </div>
          )}
      </div>
    </div>
  );
}
