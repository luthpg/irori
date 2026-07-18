import type { Metadata } from 'next';
import { Noto_Sans_JP, Noto_Sans_Mono } from 'next/font/google';
import './globals.css';

const notoSansJp = Noto_Sans_JP({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '700'],
  display: 'swap',
});

const notoSansMono = Noto_Sans_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Irori (イロリ) | デジタルな囲炉裏チャット',
  description:
    '深く沈んだ夜のようなダークテーマで、穏やかに語り合うデジタルな囲炉裏スペース。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${notoSansJp.variable} ${notoSansMono.variable} h-full bg-[#0A0A0C] text-[#F5F5F7]`}
    >
      <body className="min-h-full flex flex-col font-sans antialiased selection:bg-[#FF5722] selection:text-white">
        {children}
      </body>
    </html>
  );
}
