'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import styles from '../page.module.scss';

export default function PaymentFailurePage() {
  const t = useTranslations('payment');

  return (
    <main className={styles.main}>
      <section className={styles.container}>
        <div className={`${styles.icon} ${styles.iconFailure}`} role="img" aria-label={t('failure_title')}>
          &#10007;
        </div>
        <h1 className={styles.title}>{t('failure_title')}</h1>
        <p className={styles.message}>{t('failure_message')}</p>
        <Link href="/search" className={styles.link}>
          {t('try_again')}
        </Link>
      </section>
    </main>
  );
}
