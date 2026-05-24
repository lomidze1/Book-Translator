'use client';

import { useTranslations } from 'next-intl';
import styles from './admin.module.scss';

interface Props {
  page: number;
  pageCount: number;
  total: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, pageCount, total, onPageChange }: Props) {
  const t = useTranslations('admin');
  if (total === 0) return null;
  return (
    <div className={styles.pagination}>
      <button
        type="button"
        className={styles.actionBtn}
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        {t('prev')}
      </button>
      <span className={styles.pageInfo}>
        {t('page_of', { page, total: pageCount })}
      </span>
      <button
        type="button"
        className={styles.actionBtn}
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pageCount}
      >
        {t('next')}
      </button>
    </div>
  );
}
