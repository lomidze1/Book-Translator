import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';

export const runtime = 'edge';
export const alt = 'Book Translator';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OgImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo' });

  const headline = locale === 'ka' ? 'წიგნების AI თარგმანი' : 'AI Book Translation';
  const subline = locale === 'ka' ? 'ქართულად, Claude AI-ით' : 'into your language, powered by Claude AI';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px',
          background: 'linear-gradient(135deg, #1e3a8a 0%, #6d28d9 100%)',
          color: 'white',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 32, opacity: 0.85, letterSpacing: 3, textTransform: 'uppercase' }}>
          {t('site_name')}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1 }}>
            {headline}
          </div>
          <div style={{ fontSize: 40, opacity: 0.85, lineHeight: 1.3 }}>
            {subline}
          </div>
        </div>

        <div
          style={{
            fontSize: 26,
            opacity: 0.7,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          <span style={{ display: 'flex', gap: 16 }}>
            <span>PDF</span>
            <span>·</span>
            <span>EPUB</span>
            <span>·</span>
            <span>DOCX</span>
          </span>
          <span>booktranslator.ge</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
