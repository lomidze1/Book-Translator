import type { MetadataRoute } from 'next';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://booktranslator.ge';
  const locales = ['ka', 'en'];
  const staticRoutes = ['', '/search', '/login', '/register', '/upload'];

  const entries: MetadataRoute.Sitemap = [];

  // Static routes
  for (const route of staticRoutes) {
    for (const locale of locales) {
      entries.push({
        url: `${baseUrl}/${locale}${route}`,
        changeFrequency: route === '' ? 'weekly' : 'monthly',
        priority: route === '' ? 1.0 : 0.7,
      });
    }
  }

  // Dynamic book pages
  try {
    const res = await fetch(`${API_URL}/api/books?limit=100`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const { data: books } = await res.json();
      for (const book of books || []) {
        for (const locale of locales) {
          entries.push({
            url: `${baseUrl}/${locale}/books/${book.id}`,
            lastModified: new Date(book.updatedAt || book.createdAt),
            changeFrequency: 'weekly',
            priority: 0.8,
          });
        }
      }
    }
  } catch {
    // API unavailable — return static routes only
  }

  return entries;
}
