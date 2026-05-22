import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://booktranslator.ge';

  // We deliberately do NOT Disallow auth/profile/payment/reader routes here:
  // every one of those pages already sets `robots: { index: false }` in its
  // metadata, and Google can only honor a `noindex` tag if it can actually
  // crawl the page. Disallowing the same route in robots.txt blocks the
  // crawler, which means the URL can still appear in the index as a "URL only"
  // result. Keeping just /api/ blocked here gives us the best of both worlds.
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
