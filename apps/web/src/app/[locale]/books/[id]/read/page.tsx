'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { setApiUrl } from '@book-translator/reader';
import ReaderView from './ReaderView';
import styles from './reader.module.scss';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
setApiUrl(API_URL);

interface TranslatedChapter {
  id: string;
  translatedContent: string;
  chapter: { number: number; title?: string };
}

interface TranslationData {
  id: string;
  status: string;
  progress: number;
  targetLanguage: string;
  book: { id: string; title: string; author?: string };
  translatedChapters: TranslatedChapter[];
}

export default function ReaderPage() {
  const t = useTranslations('reader');
  const params = useParams();
  const router = useRouter();
  const [translation, setTranslation] = useState<TranslationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
      setError(t('login_required'));
      setLoading(false);
      return;
    }
    setToken(accessToken);

    async function fetchTranslation(attempt = 0) {
      try {
        const res = await fetch(`${API_URL}/api/translations/book/${params.id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok) {
          setError(t('not_found'));
          setLoading(false);
          return;
        }

        const translations = await res.json();
        const completed = translations.find((tr: { status: string }) => tr.status === 'COMPLETED');

        if (!completed) {
          const inProgress = translations.find(
            (tr: { status: string }) => tr.status === 'IN_PROGRESS' || tr.status === 'PAID'
          );

          if (inProgress && attempt < 5) {
            await new Promise(r => setTimeout(r, 3000));
            return fetchTranslation(attempt + 1);
          }

          if (!inProgress && attempt < 3) {
            await new Promise(r => setTimeout(r, 2000));
            return fetchTranslation(attempt + 1);
          }

          setError(t('not_ready'));
          setLoading(false);
          return;
        }

        const fullRes = await fetch(`${API_URL}/api/translations/${completed.id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!fullRes.ok) {
          setError(t('not_found'));
          setLoading(false);
          return;
        }

        setTranslation(await fullRes.json());
        setLoading(false);
      } catch {
        setError(t('error_network'));
        setLoading(false);
      }
    }

    fetchTranslation();
  }, [params.id, t]);

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <p>{t('loading')}</p>
      </div>
    );
  }

  if (error || !translation || !token) {
    return (
      <div className={styles.errorState}>
        <p>{error}</p>
        <button className={styles.backBtn} onClick={() => router.back()}>
          {t('back_to_book')}
        </button>
      </div>
    );
  }

  return <ReaderView translation={translation} token={token} />;
}
