import type { Metadata } from 'next';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import './globals.scss';

export const metadata: Metadata = {
  title: 'Book Translator - წიგნების AI თარგმანი',
  description:
    'ინგლისურენოვანი წიგნების ქართულ ენაზე AI თარგმანის პლატფორმა. ატვირთე, გადათარგმნე, წაიკითხე.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ka">
      <body>
        <Navbar />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
