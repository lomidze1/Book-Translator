'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import styles from '../../../../books/[id]/read/page.module.scss';

interface TranslatedChapter {
  id: string;
  translatedContent: string;
  chapter: {
    number: number;
    title?: string;
  };
}

interface TranslationData {
  id: string;
  status: string;
  progress: number;
  targetLanguage: string;
  book: {
    id: string;
    title: string;
    author?: string;
  };
  translatedChapters: TranslatedChapter[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function ReaderPage() {
  const t = useTranslations('book');
  const params = useParams();
  const router = useRouter();
  const [translation, setTranslation] = useState<TranslationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeChapter, setActiveChapter] = useState(1);

  useEffect(() => {
    async function fetchTranslation() {
      try {
        const token = localStorage.getItem('accessToken');
        if (!token) {
          setError(t('error_login_required'));
          return;
        }

        // First get the book's translations
        const res = await fetch(`${API_URL}/api/translations/book/${params.id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!res.ok) {
          setError(t('reader_not_found'));
          return;
        }

        const translations = await res.json();
        const completed = translations.find((tr: { status: string }) => tr.status === 'COMPLETED');

        if (!completed) {
          setError(t('reader_not_ready'));
          return;
        }

        // Fetch full translation with chapters
        const fullRes = await fetch(`${API_URL}/api/translations/${completed.id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!fullRes.ok) {
          setError(t('reader_not_found'));
          return;
        }

        const fullTranslation = await fullRes.json();
        setTranslation(fullTranslation);
      } catch {
        setError(t('error_network'));
      } finally {
        setLoading(false);
      }
    }

    if (params.id) fetchTranslation();
  }, [params.id, t]);

  if (loading) {
    return (
      <div className={styles.main}>
        <div className={styles.container}>
          <p className={styles.loading}>{t('reader_loading')}</p>
        </div>
      </div>
    );
  }

  if (error || !translation) {
    return (
      <div className={styles.main}>
        <div className={styles.container}>
          <p className={styles.error} role="alert">{error}</p>
          <button onClick={() => router.back()} className={styles.backLink}>
            {t('reader_back_to_book')}
          </button>
        </div>
      </div>
    );
  }

  const chapters = [...translation.translatedChapters].sort(
    (a, b) => a.chapter.number - b.chapter.number
  );

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <Link href={`/books/${translation.book.id}`} className={styles.backLink}>
          {t('reader_back_to_book')}
        </Link>

        <div className={styles.header}>
          <h1>{translation.book.title} — {t('reader_title')}</h1>
          {translation.book.author && (
            <p className={styles.author}>{translation.book.author}</p>
          )}
        </div>

        <div className={styles.layout}>
          {/* Table of Contents Sidebar */}
          <nav className={styles.sidebar}>
            <h3>{t('reader_contents')}</h3>
            <ul>
              {chapters.map((ch) => (
                <li key={ch.id}>
                  <a
                    href={`#chapter-${ch.chapter.number}`}
                    className={`${styles.tocLink} ${activeChapter === ch.chapter.number ? styles.active : ''}`}
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveChapter(ch.chapter.number);
                      document.getElementById(`chapter-${ch.chapter.number}`)?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    {ch.chapter.title || t('reader_chapter', { number: ch.chapter.number })}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Chapter Content */}
          <div className={styles.content}>
            {chapters.map((ch) => (
              <article
                key={ch.id}
                id={`chapter-${ch.chapter.number}`}
                className={styles.chapter}
              >
                <h2>{ch.chapter.title || t('reader_chapter', { number: ch.chapter.number })}</h2>
                <div className={styles.chapterText}>
                  {ch.translatedContent.split('\n').map((paragraph, i) => (
                    paragraph.trim() ? <p key={i}>{paragraph}</p> : null
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
