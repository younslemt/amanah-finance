import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import type { CSSProperties, ReactNode } from 'react';
import { brand, brandCssVariables } from '@/config/brand';
import { PwaClient } from '@/components/pwa/pwa-client';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap' });

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: brand.description,
  applicationName: brand.name,
  icons: { icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }, { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: brand.shortName, statusBarStyle: 'default' },
  manifest: '/manifest.webmanifest',
  robots: { index: false, follow: false }, // pré-lancement
};

export const viewport: Viewport = {
  themeColor: brand.colors.primary900,
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={brand.locale} className={`${inter.variable} ${fraunces.variable}`} style={brandCssVariables() as CSSProperties}>
      <body>{children}<PwaClient /></body>
    </html>
  );
}
