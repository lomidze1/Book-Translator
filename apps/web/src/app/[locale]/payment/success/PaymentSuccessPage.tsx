'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function PaymentSuccessPage() {
  const t = useTranslations('payment');

  return (
    <div style={{ minHeight: 'calc(100vh - 140px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 480, padding: '2rem' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>&#10003;</div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>{t('success_title')}</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>{t('success_message')}</p>
        <Link href="/search" style={{
          display: 'inline-block',
          padding: '12px 28px',
          background: 'var(--primary)',
          color: 'white',
          borderRadius: '8px',
          textDecoration: 'none',
          fontWeight: 600,
        }}>
          {t('back_to_books')}
        </Link>
      </div>
    </div>
  );
}
