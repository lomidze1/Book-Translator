'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/navigation';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import PaymentModal from '@/components/PaymentModal';
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
  const router = useRouter();
  const pathname = usePathname();
  const [book, setBook] = useState<BookDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [translating, setTranslating] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [pricing, setPricing] = useState<{
    pageCount: number;
    hasExistingTranslation: boolean;
    existing: { amount: number; currency: string } | null;
    fast: { amount: number; currency: string } | null;
    slow: { amount: number; currency: string } | null;
  } | null>(null);
  const [paymentModal, setPaymentModal] = useState<{
    type: 'TRANSLATION' | 'PURCHASE_TRANSLATION';
    amount: number;
    currency: string;
    translationId?: string;
    translationType?: 'FAST' | 'STANDARD';
  } | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pollFailCount, setPollFailCount] = useState(0);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // Fetch book data
  useEffect(() => {
    async function fetchBook(retries = 2) {
      try {
        const res = await fetch(`${API_URL}/api/books/${params.id}`);
        if (res.status === 429 && retries > 0) {
          await new Promise(r => setTimeout(r, 2000));
          return fetchBook(retries - 1);
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || 'Book not found');
        }
        const data = await res.json();
        setBook(data);

        // Fetch pricing
        try {
          const priceRes = await fetch(`${API_URL}/api/payments/pricing/${params.id}`);
          if (priceRes.ok) setPricing(await priceRes.json());
        } catch { /* pricing fetch is non-critical */ }
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        if (message.includes('Too many') || message.includes('rate')) {
          setError(t('error_rate_limit'));
        } else {
          setError(t('not_found'));
        }
      } finally {
        setLoading(false);
      }
    }
    if (params.id) fetchBook();
  }, [params.id, t]);

  // Poll for translation progress when IN_PROGRESS or PAID
  const startPolling = useCallback((translationId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    const pollOnce = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        if (!token) return;

        const res = await fetch(`${API_URL}/api/translations/${translationId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        // On rate limit, skip this cycle — don't spam
        if (res.status === 429) return;
        if (!res.ok) return;

        const translation = await res.json();
        setPollFailCount(0);

        // Update book's translation data in state
        setBook(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            translations: prev.translations.map(tr =>
              tr.id === translationId
                ? { ...tr, status: translation.status, progress: translation.progress, completedAt: translation.completedAt }
                : tr
            ),
          };
        });

        // Stop polling if done
        if (translation.status === 'COMPLETED' || translation.status === 'FAILED') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setTranslating(false);
        }
      } catch (err) {
        console.error('Translation poll failed:', err);
        setPollFailCount(prev => prev + 1);
      }
    };

    // Immediate first poll, then every 5 seconds
    pollOnce();
    pollingRef.current = setInterval(pollOnce, 5000);
  }, []);

  // Auto-start polling if there's an active translation
  useEffect(() => {
    if (!book) return;
    const active = book.translations.find(tr => tr.status === 'IN_PROGRESS' || tr.status === 'PAID');
    if (active) {
      setTranslating(true);
      startPolling(active.id);
    }
  }, [book?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTranslateClick = async (translationType: 'FAST' | 'STANDARD' = 'FAST') => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setShowLoginPrompt(true);
        return;
      }

      setTranslating(true);
      setError('');

      const res = await fetch(`${API_URL}/api/translations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ bookId: book!.id, translationType }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data.message || '';
        if (res.status === 403 || msg.includes('access')) {
          setError(t('error_no_access'));
        } else if (res.status === 400 && msg.includes('already exists')) {
          setError(t('error_translation_exists'));
        } else if (res.status === 429) {
          setError(t('error_rate_limit'));
        } else {
          setError(t('error_translation_failed'));
        }
        setTranslating(false);
        return;
      }

      const translation = await res.json();

      // Dev mode: translation starts automatically
      if (translation.status === 'PAID' || translation.status === 'IN_PROGRESS') {
        // Add new translation to book state
        setBook(prev => prev ? {
          ...prev,
          translations: [...prev.translations, {
            id: translation.id,
            status: translation.status,
            targetLanguage: translation.targetLanguage || 'ka',
            progress: translation.progress || 0,
          }],
        } : prev);

        startPolling(translation.id);
        return;
      }

      // Production: open payment modal
      setTranslating(false);
      setPaymentModal({
        type: 'TRANSLATION',
        amount: 10,
        currency: 'GEL',
        translationId: translation.id,
      });
    } catch {
      setError(t('error_network'));
      setTranslating(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.main}>
        <div className={styles.container}>
          <p className={styles.loading}>{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (error && !book) {
    return (
      <div className={styles.main}>
        <div className={styles.container}>
          <p className={styles.error} role="alert">{error || t('not_found')}</p>
          <button onClick={() => router.back()} className={styles.backLink}>{t('back_to_search')}</button>
        </div>
      </div>
    );
  }

  if (!book) return null;

  const completedTranslation = book.translations.find(tr => tr.status === 'COMPLETED');
  const inProgressTranslation = book.translations.find(tr => tr.status === 'IN_PROGRESS');
  const paidTranslation = book.translations.find(tr => tr.status === 'PAID');
  const pendingTranslation = book.translations.find(tr => tr.status === 'PENDING');
  const failedTranslation = book.translations.find(tr => tr.status === 'FAILED');
  // Show PAID as "in progress" visually (translation is about to start)
  const activeTranslation = inProgressTranslation || paidTranslation;

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <button onClick={() => router.back()} className={styles.backLink}>{t('back_to_search')}</button>

        {showLoginPrompt && (
          <div className={styles.loginPrompt} role="alert">
            <p className={styles.loginPromptTitle}>{t('login_required_description')}</p>
            <div className={styles.loginPromptActions}>
              <Link href={`/login?returnUrl=${encodeURIComponent(pathname)}`} className={styles.btnPrimary}>
                {t('login_button')}
              </Link>
              <button onClick={() => setShowLoginPrompt(false)} className={styles.btnSecondary}>
                {t('back_to_search')}
              </button>
            </div>
          </div>
        )}

        {error && <p className={styles.error} role="alert">{error}</p>}

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
                <Link href={`/books/${book.id}/read`} className={styles.btnPrimary}>
                  {t('read_translation')}
                </Link>
              ) : activeTranslation ? (
                <div className={styles.progressBox}>
                  <div className={styles.spinner} />
                  <p>{activeTranslation.progress === 0 ? t('translation_started') : t('translation_progress', { progress: Math.round(activeTranslation.progress) })}</p>
                  <div className={styles.progressBar}>
                    <div className={`${styles.progressFill} ${activeTranslation.progress === 0 ? styles.progressPulse : ''}`} style={{ width: activeTranslation.progress === 0 ? '100%' : `${activeTranslation.progress}%` }} />
                  </div>
                  <span>100%</span>
                  {pollFailCount >= 3 && <p className={styles.pollWarning}>{t('status_checking')}</p>}
                </div>
              ) : failedTranslation ? (
                <div>
                  <p className={styles.error}>{t('translation_failed')}</p>
                  <button className={styles.btnPrimary} onClick={() => handleTranslateClick('FAST')}>
                    {t('retry_translation')}
                  </button>
                </div>
              ) : pendingTranslation ? (
                <button className={styles.btnPrimary} disabled>{t('translation_pending')}</button>
              ) : pricing ? (
                <div className={styles.pricingOptions}>
                  {pricing.hasExistingTranslation && pricing.existing ? (
                    <button
                      className={styles.btnPrimary}
                      onClick={() => handleTranslateClick('FAST')}
                      disabled={translating}
                    >
                      {t('translate_existing', { price: pricing.existing.amount })}
                    </button>
                  ) : (
                    <>
                      <button
                        className={styles.btnPrimary}
                        onClick={() => handleTranslateClick('FAST')}
                        disabled={translating}
                      >
                        {translating ? t('translation_started') : t('translate_fast', { price: pricing.fast?.amount || 10 })}
                      </button>
                      <p className={styles.pricingDesc}>{t('translate_fast_desc')}</p>

                      <button
                        className={styles.btnSecondary}
                        onClick={() => handleTranslateClick('STANDARD')}
                        disabled={translating}
                      >
                        {t('translate_slow', { price: pricing.slow?.amount || 5 })}
                      </button>
                      <p className={styles.pricingDesc}>{t('translate_slow_desc')}</p>

                      <p className={styles.qualityNote}>{t('translate_quality_note')}</p>
                    </>
                  )}
                </div>
              ) : (
                <button
                  className={styles.btnPrimary}
                  onClick={() => handleTranslateClick('FAST')}
                  disabled={translating}
                >
                  {translating ? t('translation_started') : t('translate')}
                </button>
              )}
            </div>

            {paymentModal && (
              <PaymentModal
                bookId={book.id}
                bookTitle={book.title}
                type={paymentModal.type}
                translationId={paymentModal.translationId}
                amount={paymentModal.amount}
                currency={paymentModal.currency}
                onClose={() => setPaymentModal(null)}
              />
            )}

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
