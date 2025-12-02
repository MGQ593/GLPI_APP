// app/layout.tsx
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ErrorLogger } from '@/components/ErrorLogger';

export const metadata: Metadata = {
  title: 'Mesa de Ayuda TI',
  description: 'Portal de soporte técnico - Plan Automotor',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.svg',
    apple: '/icons/icon-192x192.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Mesa Ayuda',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#f97316',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body suppressHydrationWarning>
        <ErrorLogger>{children}</ErrorLogger>
      </body>
    </html>
  );
}
