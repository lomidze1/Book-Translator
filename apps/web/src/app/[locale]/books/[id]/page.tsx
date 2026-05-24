import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import BookDetailPage from './BookDetailPage';
import { API_URL } from '@/lib/api-client';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://booktranslator.ge';

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

const PREVIEW_MAX_LENGTH = 160;

// Builds the og:description / meta description for a book page. Strips HTML
// tags and collapses whitespace from book.description (sources like Google
// Books and OpenLibrary often return inline markup), then trims to the last
// word boundary so the preview doesn't end mid-word. Falls back to a
// localized "Title by Author" line when the book has no description.
function buildBookDescription(
  book: { title: string; author?: string | null; description?: string | null },
  seo: (key: string, values?: Record<string, string>) => string,
): string {
  const raw = book.description?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (raw) {
    if (raw.length <= PREVIEW_MAX_LENGTH) return raw;
    const cut = raw.slice(0, PREVIEW_MAX_LENGTH + 1);
    const lastSpace = cut.lastIndexOf(' ');
    const trimmed = (lastSpace > 80 ? cut.slice(0, lastSpace) : cut.slice(0, PREVIEW_MAX_LENGTH)).trimEnd();
    return `${trimmed}…`;
  }
  return book.author
    ? seo('book_description_fallback', { title: book.title, author: book.author })
    : seo('book_description_fallback_no_author', { title: book.title });
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

  const description = buildBookDescription(book, seo);
  // When a cover exists, use it (recognizable to readers). Otherwise let the
  // file convention at books/[id]/opengraph-image.tsx render a dynamic image
  // with the book's title/author — better than the generic site fallback.
  const customImage = book.coverUrl
    ? [{ url: book.coverUrl, width: 1200, height: 630, alt: book.title }]
    : undefined;

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
      ...(customImage ? { images: customImage } : {}),
      type: 'book' as const,
      url: `${BASE_URL}/${locale}/books/${id}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: book.title,
      description,
      ...(book.coverUrl ? { images: [book.coverUrl] } : {}),
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
