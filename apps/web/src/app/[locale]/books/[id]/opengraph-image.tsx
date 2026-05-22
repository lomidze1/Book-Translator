import { ImageResponse } from 'next/og';

// Dynamic OG image for book detail pages. Crawlers (LinkedIn, Twitter,
// Facebook, Telegram, iMessage, etc.) request this URL when a /books/:id link
// is shared. A book-specific image dramatically lifts social CTR vs. the
// generic site-wide og-image.png that everyone else falls back to.

export const runtime = 'edge';
export const alt = 'Book Translator';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function fetchBook(id: string) {
  try {
    const res = await fetch(`${API_URL}/api/books/${id}`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return res.json() as Promise<{ title: string; author?: string | null }>;
  } catch {
    return null;
  }
}

export default async function OgImage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const book = await fetchBook(params.id);
  const title = book?.title ?? 'Book Translator';
  const author = book?.author ?? '';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px',
          background: 'linear-gradient(135deg, #1e3a8a 0%, #6d28d9 100%)',
          color: 'white',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 28, opacity: 0.85, letterSpacing: 2 }}>
          BOOK&nbsp;TRANSLATOR
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              lineHeight: 1.1,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {title}
          </div>
          {author && (
            <div style={{ fontSize: 36, opacity: 0.85 }}>{author}</div>
          )}
        </div>

        <div
          style={{
            fontSize: 24,
            opacity: 0.75,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>{params.locale === 'ka' ? 'წაიკითხეთ ქართულად' : 'Read in your language'}</span>
          <span>booktranslator.ge</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
