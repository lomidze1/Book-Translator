import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://booktranslator.ge';

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/*/login', '/*/register', '/*/forgot-password', '/*/verify-email', '/*/reset-password', '/*/confirm-password-change', '/*/payment/', '/*/books/*/read', '/*/dashboard', '/*/library', '/*/settings', '/*/profile'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
