import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reader',
  robots: { index: false, follow: false },
};

export default function ReaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
