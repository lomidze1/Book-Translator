import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import ProfilePage from './ProfilePage';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'navbar' });

  return {
    title: t('profile'),
    robots: { index: false, follow: false },
  };
}

export default function Page() {
  return <ProfilePage />;
}
