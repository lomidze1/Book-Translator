import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Book Translator — წიგნების AI თარგმანი',
    short_name: 'BookTranslator',
    description: 'ინგლისურენოვანი წიგნების ქართულ ენაზე AI თარგმანის პლატფორმა',
    // Let next-intl middleware negotiate locale from Accept-Language on launch
    // instead of hardcoding /ka — otherwise English-only PWA installs always
    // open Georgian first, which surprises non-Georgian users.
    start_url: '/',
    scope: '/',
    display: 'standalone',
    dir: 'ltr',
    background_color: '#ffffff',
    theme_color: '#2563eb',
    orientation: 'any',
    categories: ['books', 'education'],
    lang: 'ka',
    icons: [
      { src: '/favicon.ico', sizes: 'any', type: 'image/x-icon' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
