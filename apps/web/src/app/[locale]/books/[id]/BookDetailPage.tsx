'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import styles from '../../../books/[id]/page.module.scss';

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
  const t = useTranslations('book');
  const params = useParams();
  const [book, setBook] = useState<BookDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchBook() {
      try {
        const res = await fetch(`${API_URL}/api/books/${params.id}`);
        if (!res.ok) throw new Error('Book not found');
        const data = await res.json();
        setBook(data);
      } catch {
        setError(t('not_found'));
      } finally {
        setLoading(false);
      }
    }
    if (params.id) fetchBook();
  }, [params.id, t]);

  if (loading) {
    return (
      <div className={styles.main}>
        <div className={styles.container}>
          <p className={styles.loading}>{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className={styles.main}>
        <div className={styles.container}>
          <p className={styles.error}>{error || t('not_found')}</p>
          <Link href="/search" className={styles.backLink}>{t('back_to_search')}</Link>
        </div>
      </div>
    );
  }

  const completedTranslation = book.translations.find(t => t.status === 'COMPLETED');
  const inProgressTranslation = book.translations.find(t => t.status === 'IN_PROGRESS');

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <Link href="/search" className={styles.backLink}>{t('back_to_search')}</Link>

        <div className={styles.bookLayout}>
          <div className={styles.coverSection}>
            {book.coverUrl ? (
              <Image src={book.coverUrl} alt={book.title} width={300} height={450} className={styles.cover} style={{ objectFit: 'cover' }} />
            ) : (
              <div className={styles.noCover}>📚</div>
            )}
          </div>

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
                  <span className={styles.metaLabel}>{t('pages')}</span>
                  <span>{book.pageCount}</span>
                </div>
              )}
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{t('format')}</span>
                <span>{book.originalFormat}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{t('language')}</span>
                <span>{book.language === 'en' ? t('language_en') : book.language}</span>
              </div>
            </div>

            {book.description && (
              <div className={styles.description}>
                <h3>{t('description')}</h3>
                <p>{book.description}</p>
              </div>
            )}

            <div className={styles.actions}>
              {completedTranslation ? (
                <button className={styles.btnPrimary}>{t('translation_georgian')}</button>
              ) : inProgressTranslation ? (
                <div className={styles.progressBox}>
                  <p>{t('translation_in_progress')}</p>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${inProgressTranslation.progress}%` }} />
                  </div>
                  <span>{Math.round(inProgressTranslation.progress)}%</span>
                </div>
              ) : (
                <button className={styles.btnPrimary}>{t('translate')}</button>
              )}
              <button className={styles.btnSecondary}>{t('english_version')}</button>
            </div>

            {book.chapters.length > 0 && (
              <div className={styles.chapters}>
                <h3>{t('chapters', { count: book.chapters.length })}</h3>
                <ul>
                  {book.chapters.map((ch) => (
                    <li key={ch.id}>
                      <span className={styles.chapterNum}>{t('chapter', { number: ch.number })}</span>
                      {ch.title && <span> — {ch.title}</span>}
                      {ch.wordCount && (
                        <span className={styles.wordCount}>
                          {t('words', { count: ch.wordCount.toLocaleString() })}
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
    </div>
  );
}
