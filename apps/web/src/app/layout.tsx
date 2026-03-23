import type { Metadata } from "next";
import "./globals.scss";

export const metadata: Metadata = {
  title: "Book Translator",
  description: "Online book translation platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ka">
      <body>{children}</body>
    </html>
  );
}
