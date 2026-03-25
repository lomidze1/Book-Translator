'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import styles from '../page.module.scss';

export default function HomePage() {
  const t = useTranslations('home');

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.title}>
          {t('hero_title')} <span className={styles.highlight}>{t('hero_highlight')}</span> {t('hero_suffix')}
        </h1>
        <p className={styles.subtitle}>{t('hero_subtitle')}</p>
        <div className={styles.actions}>
          <Link href="/register" className={styles.primaryBtn}>
            {t('start_free')}
          </Link>
          <Link href="#features" className={styles.secondaryBtn}>
            {t('learn_more')}
          </Link>
        </div>
      </section>

      <section id="features" className={styles.features}>
        <h2 className={styles.sectionTitle}>{t('features_title')}</h2>
        <div className={styles.grid}>
          <div className={styles.card}>
            <h3>{t('feature_ai')}</h3>
            <p>{t('feature_ai_desc')}</p>
          </div>
          <div className={styles.card}>
            <h3>{t('feature_reader')}</h3>
            <p>{t('feature_reader_desc')}</p>
          </div>
          <div className={styles.card}>
            <h3>{t('feature_tts')}</h3>
            <p>{t('feature_tts_desc')}</p>
          </div>
          <div className={styles.card}>
            <h3>{t('feature_formats')}</h3>
            <p>{t('feature_formats_desc')}</p>
          </div>
        </div>
      </section>

      <section className={styles.pricing}>
        <h2 className={styles.sectionTitle}>{t('pricing_title')}</h2>
        <div className={styles.priceGrid}>
          <div className={styles.priceCard}>
            <h3>{t('pricing_new')}</h3>
            <p className={styles.price}>10 &#8382;</p>
            <p>{t('pricing_new_desc')}</p>
          </div>
          <div className={styles.priceCard}>
            <h3>{t('pricing_existing')}</h3>
            <p className={styles.price}>5 &#8382;</p>
            <p>{t('pricing_existing_desc')}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
