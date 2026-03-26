import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import ForgotPasswordForm from './ForgotPasswordForm';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo' });

  return {
    title: t('forgot_password_title'),
    robots: { index: false, follow: false },
  };
}

export default function Page() {
  return <ForgotPasswordForm />;
}
