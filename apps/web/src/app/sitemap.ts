import type { MetadataRoute } from 'next';
import { API_URL } from '@/lib/api-client';


const LOCALES = ['ka', 'en'] as const;
type Locale = (typeof LOCALES)[number];

// Only routes that are actually indexable belong in the sitemap. /login, /register
// and other noindex pages were previously listed here, which triggered Google Search
// Console "Submitted URL marked 'noindex'" warnings and wasted crawl budget.
const INDEXABLE_STATIC_ROUTES = ['', '/search', '/upload'] as const;

// Sitemap protocol cap is 50,000 URLs; we also cap our own walk to keep build time
// bounded. If/when we cross this we should switch to a sitemap index.
const MAX_BOOKS = 5000;
const BOOKS_PAGE_SIZE = 200;

function alternateLanguages(baseUrl: string, path: string) {
  return Object.fromEntries(
    LOCALES.map((l): [Locale, string] => [l, `${baseUrl}/${l}${path}`]),
  ) as Record<Locale, string>;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://booktranslator.ge';
  const entries: MetadataRoute.Sitemap = [];

  // Static routes — one entry per locale, with hreflang alternates.
  for (const route of INDEXABLE_STATIC_ROUTES) {
    for (const locale of LOCALES) {
      entries.push({
        url: `${baseUrl}/${locale}${route}`,
        changeFrequency: route === '' ? 'weekly' : 'monthly',
        priority: route === '' ? 1.0 : 0.7,
        alternates: { languages: alternateLanguages(baseUrl, route) },
      });
    }
  }

  // Dynamic book pages — paginate through /api/books so we don't hard-stop at 100.
  try {
    let page = 1;
    while (entries.length < MAX_BOOKS * LOCALES.length + 32) {
      const res = await fetch(
        `${API_URL}/api/books?page=${page}&limit=${BOOKS_PAGE_SIZE}`,
        { next: { revalidate: 3600 } },
      );
      if (!res.ok) break;
      const payload = await res.json();
      const books: Array<{ id: string; updatedAt?: string; createdAt?: string }> =
        payload.data ?? payload.books ?? [];
      if (books.length === 0) break;

      for (const book of books) {
        const path = `/books/${book.id}`;
        for (const locale of LOCALES) {
          entries.push({
            url: `${baseUrl}/${locale}${path}`,
            lastModified: new Date(book.updatedAt || book.createdAt || Date.now()),
            changeFrequency: 'weekly',
            priority: 0.8,
            alternates: { languages: alternateLanguages(baseUrl, path) },
          });
        }
      }

      if (books.length < BOOKS_PAGE_SIZE) break; // last page
      page += 1;
    }
  } catch {
    // API unavailable — return whatever we have so far.
  }

  return entries;
}
