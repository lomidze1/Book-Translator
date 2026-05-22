import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import BookDetailPage from './BookDetailPage';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://booktranslator.ge';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface BookDto {
  id: string;
  title: string;
  author?: string | null;
  description?: string | null;
  coverUrl?: string | null;
  isbn?: string | null;
  language?: string | null;
  pageCount?: number | null;
  translations?: Array<{ id: string; status: string; targetLanguage: string }>;
}

async function fetchBook(id: string): Promise<BookDto | null> {
  try {
    const res = await fetch(`${API_URL}/api/books/${id}`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const book = await fetchBook(id);

  const seo = await getTranslations({ locale, namespace: 'seo' });
  if (!book) {
    // Tell crawlers + browsers explicitly that this URL has no content. The page
    // component will also call notFound() so the response status is a real 404.
    return {
      title: seo('book_not_found'),
      robots: { index: false, follow: false },
    };
  }

  const description =
    book.description?.substring(0, 160) || `${book.title} by ${book.author ?? ''}`.trim();
  const ogImage = book.coverUrl || `${BASE_URL}/og-image.png`;

  return {
    title: `${book.title} — ${book.author ?? ''}`.trim(),
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

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const book = await fetchBook(id);

  // Invalid / deleted book → real 404. Without this the client component would
  // render an empty shell at HTTP 200, which Google treats as a soft-404 and
  // demotes the entire books/ subtree.
  if (!book) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: 'navbar' });

  // Some books have a completed Georgian translation. Expose that as a
  // schema.org `workTranslation` so search engines can match queries like
  // "[book name] ქართულად".
  const georgianTranslation = book.translations?.find(
    (tr) => tr.targetLanguage === 'ka' && tr.status === 'COMPLETED',
  );

  const bookJsonLd = Object.fromEntries(
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
      bookFormat: 'https://schema.org/EBook',
      publisher: { '@type': 'Organization', name: 'Book Translator' },
      workTranslation: georgianTranslation
        ? {
            '@type': 'Book',
            inLanguage: 'ka',
            translationOfWork: { '@type': 'Book', name: book.title },
            url: `${BASE_URL}/ka/books/${id}`,
          }
        : null,
      url: `${BASE_URL}/${locale}/books/${id}`,
    }).filter(([, v]) => v != null),
  );

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: t('search'),
        item: `${BASE_URL}/${locale}/search`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: book.title,
        item: `${BASE_URL}/${locale}/books/${id}`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(bookJsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <BookDetailPage />
    </>
  );
}
