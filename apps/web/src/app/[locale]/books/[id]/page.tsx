import type { Metadata } from 'next';
import BookDetailPage from './BookDetailPage';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://booktranslator.ge';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale, id } = await params;

  try {
    const res = await fetch(`${API_URL}/api/books/${id}`, { next: { revalidate: 3600 } });
    if (!res.ok) return { title: 'Book Not Found' };

    const book = await res.json();

    return {
      title: `${book.title} — ${book.author || ''}`.trim(),
      description: book.description?.substring(0, 160) || `${book.title} by ${book.author}`,
      alternates: {
        canonical: `${BASE_URL}/${locale}/books/${id}`,
        languages: {
          ka: `${BASE_URL}/ka/books/${id}`,
          en: `${BASE_URL}/en/books/${id}`,
        },
      },
      openGraph: {
        title: book.title,
        description: book.description?.substring(0, 160) || `${book.title} by ${book.author}`,
        images: book.coverUrl ? [{ url: book.coverUrl }] : [],
        type: 'book' as const,
        url: `${BASE_URL}/${locale}/books/${id}`,
      },
    };
  } catch {
    return { title: 'Book Not Found' };
  }
}

export default function Page() {
  return <BookDetailPage />;
}
