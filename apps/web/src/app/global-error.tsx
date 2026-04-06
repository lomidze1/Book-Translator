'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body style={{ fontFamily: 'Arial, sans-serif', textAlign: 'center', padding: '60px 20px' }}>
        <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>
          დაფიქსირდა შეცდომა
        </h1>
        <p style={{ color: '#6b7280', marginBottom: '24px' }}>
          გთხოვთ, სცადეთ თავიდან. თუ პრობლემა გრძელდება, დაგვიკავშირდით.
        </p>
        <button
          onClick={reset}
          style={{
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '16px',
          }}
        >
          თავიდან ცდა
        </button>
      </body>
    </html>
  );
}
