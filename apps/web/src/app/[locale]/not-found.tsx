import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import styles from './not-found.module.scss';

// `not-found.tsx` does not receive params, so we read the locale from the
// active next-intl request scope. `getTranslations()` resolves it for us.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('errors');
  return {
    title: t('not_found_metadata_title'),
    robots: { index: false, follow: true },
  };
}

export default async function NotFound() {
  const t = await getTranslations('errors');

  return (
    <main className={styles.container}>
      <h1 className={styles.code}>404</h1>
      <h2 className={styles.title}>{t('not_found_title')}</h2>
      <p className={styles.description}>{t('not_found_description')}</p>
      <Link href="/" className={styles.link}>
        {t('back_home')}
      </Link>
    </main>
  );
}
