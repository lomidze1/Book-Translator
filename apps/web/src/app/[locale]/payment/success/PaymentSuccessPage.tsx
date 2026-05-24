'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import styles from '../page.module.scss';

export default function PaymentSuccessPage() {
  const t = useTranslations('payment');

  return (
    <main className={styles.main}>
      <section className={styles.container}>
        <div className={`${styles.icon} ${styles.iconSuccess}`} role="img" aria-label={t('success_title')}>
          &#10003;
        </div>
        <h1 className={styles.title}>{t('success_title')}</h1>
        <p className={styles.message}>{t('success_message')}</p>
        <Link href="/search" className={styles.link}>
          {t('back_to_books')}
        </Link>
      </section>
    </main>
  );
}
