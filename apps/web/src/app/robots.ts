import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://booktranslator.ge';

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/*/verify-email', '/*/reset-password', '/*/payment/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
