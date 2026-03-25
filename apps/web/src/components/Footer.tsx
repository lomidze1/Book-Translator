'use client';

import { useTranslations } from 'next-intl';
import styles from './Footer.module.scss';

export default function Footer() {
  const t = useTranslations('footer');

  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <p>{t('copyright', { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  );
}
