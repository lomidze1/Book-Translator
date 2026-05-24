import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata, Viewport } from 'next';
import { Noto_Sans_Georgian, Noto_Serif_Georgian } from 'next/font/google';
import { routing } from '@/i18n/routing';
import { AuthProvider } from '@/context/AuthContext';
import GoogleOAuthWrapper from '@/components/GoogleOAuthWrapper';
import { ToastProvider } from '@/context/ToastContext';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ToastContainer from '@/components/Toast';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://booktranslator.ge';
const TWITTER_HANDLE = process.env.NEXT_PUBLIC_TWITTER_HANDLE;

// Georgian-aware self-hosted fonts. Geist (the previous sans) has no Georgian
// glyphs, so it silently fell back to Arial for the entire app. Noto Sans
// Georgian is the de-facto choice for Georgian UI; the serif variant powers
// the reader view.
const notoSans = Noto_Sans_Georgian({
  subsets: ['georgian', 'latin'],
  display: 'swap',
  variable: '--font-sans',
});

const notoSerif = Noto_Serif_Georgian({
  subsets: ['georgian', 'latin'],
  display: 'swap',
  variable: '--font-serif',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1a1a' },
  ],
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  const seo = await getTranslations({ locale, namespace: 'seo' });

  return {
    metadataBase: new URL(BASE_URL),
    title: {
      template: `%s | ${seo('site_name')}`,
      default: t('title'),
    },
    description: t('description'),
    alternates: {
      canonical: `${BASE_URL}/${locale}`,
      languages: {
        ka: `${BASE_URL}/ka`,
        en: `${BASE_URL}/en`,
        'x-default': `${BASE_URL}/ka`,
      },
    },
    openGraph: {
      siteName: seo('site_name'),
      locale: locale === 'ka' ? 'ka_GE' : 'en_US',
      alternateLocale: locale === 'ka' ? 'en_US' : 'ka_GE',
      type: 'website',
      url: `${BASE_URL}/${locale}`,
      // og:image is populated by app/[locale]/opengraph-image.tsx (dynamic,
      // high-quality 1200×630 render). Don't duplicate it here or the file
      // convention's auto-injected tag gets overridden.
    },
    twitter: {
      card: 'summary_large_image',
      title: t('title'),
      description: t('description'),
      ...(TWITTER_HANDLE ? { site: TWITTER_HANDLE, creator: TWITTER_HANDLE } : {}),
    },
    robots: {
      index: true,
      follow: true,
    },
    // Declare Apple touch icon and SVG/PNG favicons explicitly. Without an
    // apple-touch-icon, iOS uses a low-quality screenshot for home-screen
    // bookmarks.
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: 'any' },
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: [{ url: '/icons/icon-192.png', sizes: '192x192' }],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  return (
    <html lang={locale} className={`${notoSans.variable} ${notoSerif.variable}`} suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'WebSite',
                  '@id': `${BASE_URL}/#website`,
                  name: 'Book Translator',
                  url: BASE_URL,
                  potentialAction: {
                    '@type': 'SearchAction',
                    target: `${BASE_URL}/${locale}/search?q={search_term_string}`,
                    'query-input': 'required name=search_term_string',
                  },
                },
                {
                  '@type': 'Organization',
                  '@id': `${BASE_URL}/#organization`,
                  name: 'Book Translator',
                  url: BASE_URL,
                  logo: {
                    '@type': 'ImageObject',
                    url: `${BASE_URL}/og-image.png`,
                  },
                },
              ],
            }).replace(/</g, '\\u003c'),
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <ServiceWorkerRegistrar />
        <NextIntlClientProvider>
          <GoogleOAuthWrapper>
          <AuthProvider>
            <ToastProvider>
              <a href="#main-content" className="skip-to-content">
                {locale === 'ka' ? 'მთავარ შიგთავსზე გადასვლა' : 'Skip to content'}
              </a>
              <Navbar />
              <main id="main-content">{children}</main>
              <Footer />
              <ToastContainer />
            </ToastProvider>
          </AuthProvider>
          </GoogleOAuthWrapper>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
