'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '../../../components/Navbar';
import Footer from '../../../components/Footer';
import styles from './page.module.scss';

interface BookDetails {
  id: string;
  title: string;
  author?: string;
  description?: string;
  isbn?: string;
  coverUrl?: string;
  language: string;
  pageCount?: number;
  originalFormat: string;
  createdAt: string;
  translations: {
    id: string;
    status: string;
    targetLanguage: string;
    progress: number;
    completedAt?: string;
  }[];
  chapters: {
    id: string;
    number: number;
    title?: string;
    wordCount?: number;
  }[];
  _count: { userBooks: number };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function BookDetailsPage() {
  const params = useParams();
  const [book, setBook] = useState<BookDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchBook() {
      try {
        const res = await fetch(`${API_URL}/books/${params.id}`);
        if (!res.ok) throw new Error('Book not found');
        const data = await res.json();
        setBook(data);
      } catch {
        setError('წიგნი ვერ მოიძებნა');
      } finally {
        setLoading(false);
      }
    }
    if (params.id) fetchBook();
  }, [params.id]);

  if (loading) {
    return (
      <>
        <Navbar />
        <main className={styles.main}>
          <div className={styles.container}>
            <p className={styles.loading}>იტვირთება...</p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (error || !book) {
    return (
      <>
        <Navbar />
        <main className={styles.main}>
          <div className={styles.container}>
            <p className={styles.error}>{error || 'წიგნი ვერ მოიძებნა'}</p>
            <Link href="/search" className={styles.backLink}>← ძებნაზე დაბრუნება</Link>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const completedTranslation = book.translations.find(t => t.status === 'COMPLETED');
  const inProgressTranslation = book.translations.find(t => t.status === 'IN_PROGRESS');

  return (
    <>
      <Navbar />
      <main className={styles.main}>
        <div className={styles.container}>
          <Link href="/search" className={styles.backLink}>← ძებნაზე დაბრუნება</Link>

          <div className={styles.bookLayout}>
            {/* Cover */}
            <div className={styles.coverSection}>
              {book.coverUrl ? (
                <img src={book.coverUrl} alt={book.title} className={styles.cover} />
              ) : (
                <div className={styles.noCover}>📚</div>
              )}
            </div>

            {/* Info */}
            <div className={styles.infoSection}>
              <h1 className={styles.title}>{book.title}</h1>
              {book.author && <p className={styles.author}>{book.author}</p>}

              <div className={styles.metaGrid}>
                {book.isbn && (
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>ISBN</span>
                    <span>{book.isbn}</span>
                  </div>
                )}
                {book.pageCount && (
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>გვერდები</span>
                    <span>{book.pageCount}</span>
                  </div>
                )}
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>ფორმატი</span>
                  <span>{book.originalFormat}</span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>ენა</span>
                  <span>{book.language === 'en' ? 'ინგლისური' : book.language}</span>
                </div>
              </div>

              {book.description && (
                <div className={styles.description}>
                  <h3>აღწერა</h3>
                  <p>{book.description}</p>
                </div>
              )}

              {/* Actions */}
              <div className={styles.actions}>
                {completedTranslation ? (
                  <button className={styles.btnPrimary}>
                    ქართული თარგმანი — 5₾
                  </button>
                ) : inProgressTranslation ? (
                  <div className={styles.progressBox}>
                    <p>თარგმნა მიმდინარეობს...</p>
                    <div className={styles.progressBar}>
                      <div
                        className={styles.progressFill}
                        style={{ width: `${inProgressTranslation.progress}%` }}
                      />
                    </div>
                    <span>{Math.round(inProgressTranslation.progress)}%</span>
                  </div>
                ) : (
                  <button className={styles.btnPrimary}>
                    გადათარგმნე — 10₾
                  </button>
                )}
                <button className={styles.btnSecondary}>
                  ინგლისური ვერსია — 1$
                </button>
              </div>

              {/* Chapters */}
              {book.chapters.length > 0 && (
                <div className={styles.chapters}>
                  <h3>თავები ({book.chapters.length})</h3>
                  <ul>
                    {book.chapters.map((ch) => (
                      <li key={ch.id}>
                        <span className={styles.chapterNum}>თავი {ch.number}</span>
                        {ch.title && <span> — {ch.title}</span>}
                        {ch.wordCount && (
                          <span className={styles.wordCount}>
                            {ch.wordCount.toLocaleString()} სიტყვა
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
