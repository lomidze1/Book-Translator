'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { usePreview } from '@/hooks/usePreview';
import { ensureAccessToken } from '@/lib/api-client';
import { PREVIEW_PAGES } from '@/lib/features';
import styles from './preview.module.scss';

/** Split on blank lines, matching how ReaderView renders chapter text. */
function toParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

export default function PreviewView() {
  const t = useTranslations('preview');
  const params = useParams();
  const bookId = typeof params.id === 'string' ? params.id : undefined;

  // A hard page load has no in-memory access token yet — mirror the reader and
  // exchange the refresh cookie before the hook's first fetch.
  const [authReady, setAuthReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    ensureAccessToken()
      .then((token) => setAuthed(Boolean(token)))
      .finally(() => setAuthReady(true));
  }, []);

  const { preview, loading, generating } = usePreview(authReady && authed ? bookId : undefined);
  const [showOriginal, setShowOriginal] = useState(false);

  const paragraphs = useMemo(
    () => (preview?.content ? toParagraphs(preview.content) : []),
    [preview],
  );
  const originalParagraphs = useMemo(
    () => (preview?.sourceText ? toParagraphs(preview.sourceText) : []),
    [preview],
  );

  if (!authReady || loading) {
    return (
      <main className={styles.page}>
        <div className={styles.spinner} role="status" aria-label={t('generating')} />
      </main>
    );
  }

  if (!authed) {
    return (
      <main className={styles.page}>
        <p className={styles.notice}>{t('login_required')}</p>
        <Link href="/login" className={styles.btnPrimary}>
          {t('login_required')}
        </Link>
      </main>
    );
  }

  if (generating || preview?.status === 'PENDING' || preview?.status === 'IN_PROGRESS') {
    return (
      <main className={styles.page}>
        <div className={styles.centered} role="status" aria-live="polite">
          <div className={styles.spinner} aria-hidden="true" />
          <p className={styles.notice}>{t('generating')}</p>
          <p className={styles.hint}>{t('generating_hint')}</p>
        </div>
      </main>
    );
  }

  if (!preview || preview.status !== 'COMPLETED' || !preview.content) {
    return (
      <main className={styles.page}>
        <p className={styles.notice}>{t('not_found')}</p>
        {bookId && (
          <Link href={`/books/${bookId}`} className={styles.backLink}>
            {t('back_to_book')}
          </Link>
        )}
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        {bookId && (
          <Link href={`/books/${bookId}`} className={styles.backLink}>
            {t('back_to_book')}
          </Link>
        )}
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.subtitle}>{t('subtitle', { pages: PREVIEW_PAGES })}</p>
        {preview.sourceWordCount && (
          <p className={styles.meta}>{t('pages_note', { words: preview.sourceWordCount })}</p>
        )}
      </header>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setShowOriginal((v) => !v)}
          aria-pressed={showOriginal}
        >
          {showOriginal ? t('hide_original') : t('show_original')}
        </button>
      </div>

      <article className={showOriginal ? styles.sideBySide : styles.single}>
        <div className={styles.column}>
          {paragraphs.map((p, i) => (
            <p key={i} className={styles.paragraph}>
              {p}
            </p>
          ))}
        </div>

        {showOriginal && (
          <div className={`${styles.column} ${styles.original}`} lang="en">
            {originalParagraphs.map((p, i) => (
              <p key={i} className={styles.paragraph}>
                {p}
              </p>
            ))}
          </div>
        )}
      </article>

      <footer className={styles.end}>
        <h2 className={styles.endTitle}>{t('end_title')}</h2>
        <p className={styles.endBody}>{t('end_body')}</p>
        {/* Back to the book page, where the pricing block and PaymentModal
            already live — one payment entry point, not two. */}
        {bookId && (
          <Link href={`/books/${bookId}`} className={styles.btnPrimary}>
            {t('buy_cta')}
          </Link>
        )}
        <p className={styles.qualityNote}>{t('quality_note')}</p>
        <p className={styles.disclaimer}>{t('disclaimer')}</p>
      </footer>
    </main>
  );
}
