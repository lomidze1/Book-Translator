'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import styles from './not-found.module.scss';

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className={styles.container}>
      <h1 className={styles.title}>{t('error_title')}</h1>
      <p className={styles.description}>{t('error_description')}</p>
      <button onClick={reset} className={styles.link}>
        {t('try_again')}
      </button>
    </main>
  );
}
