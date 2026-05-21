import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import BookDetailPage from './BookDetailPage';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://booktranslator.ge';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function fetchBook(id: string) {
  try {
    const res = await fetch(`${API_URL}/api/books/${id}`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale, id } = await params;
  const book = await fetchBook(id);

  const seo = await getTranslations({ locale, namespace: 'seo' });
  if (!book) return { title: seo('book_not_found') };

  const description = book.description?.substring(0, 160) || `${book.title} by ${book.author}`;
  const ogImage = book.coverUrl || `${BASE_URL}/og-image.png`;

  return {
    title: `${book.title} — ${book.author || ''}`.trim(),
    description,
    alternates: {
      canonical: `${BASE_URL}/${locale}/books/${id}`,
      languages: {
        ka: `${BASE_URL}/ka/books/${id}`,
        en: `${BASE_URL}/en/books/${id}`,
        'x-default': `${BASE_URL}/ka/books/${id}`,
      },
    },
    openGraph: {
      title: book.title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: book.title }],
      type: 'book' as const,
      url: `${BASE_URL}/${locale}/books/${id}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: book.title,
      description,
      images: [ogImage],
    },
  };
}

export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const book = await fetchBook(id);
  const t = await getTranslations({ locale, namespace: 'navbar' });

  const bookJsonLd = book
    ? Object.fromEntries(
        Object.entries({
          '@context': 'https://schema.org',
          '@type': 'Book',
          name: book.title,
          author: book.author ? { '@type': 'Person', name: book.author } : null,
          isbn: book.isbn || null,
          description: book.description || null,
          image: book.coverUrl || null,
          inLanguage: book.language || 'en',
          numberOfPages: book.pageCount || null,
          url: `${BASE_URL}/${locale}/books/${id}`,
        }).filter(([, v]) => v != null),
      )
    : null;

  const breadcrumbJsonLd = book
    ? {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: t('search'), item: `${BASE_URL}/${locale}/search` },
          { '@type': 'ListItem', position: 2, name: book.title, item: `${BASE_URL}/${locale}/books/${id}` },
        ],
      }
    : null;

  return (
    <>
      {bookJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(bookJsonLd).replace(/</g, '\\u003c') }}
        />
      )}
      {breadcrumbJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, '\\u003c') }}
        />
      )}
      <BookDetailPage />
    </>
  );
}
