import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import './globals.css';
import I18nProvider from '@/components/I18nProvider';
import PwaInstallBanner from '@/components/PwaInstallBanner';
import PwaRegistrar from '@/components/PwaRegistrar';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ChatProvider } from '@/lib/chat-context';
import ErrorBoundary from '@/components/ErrorBoundary';
import ClientShell from '@/components/ClientShell';

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: 'CDP Communication Hub',
  description: 'AI-powered email communication hub with draft approval workflow',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CDP Hub',
  },
  icons: {
    icon: '/icons/icon-192.svg',
    apple: '/icons/icon-192.svg',
  },
  openGraph: {
    title: 'CDP Communication Hub',
    description: 'AI-powered email communication hub with draft approval workflow',
    type: 'website',
    siteName: 'CDP Hub',
    images: [{ url: '/icons/icon-192.svg', width: 192, height: 192 }],
  },
  twitter: {
    card: 'summary',
    title: 'CDP Communication Hub',
    description: 'AI-powered email communication hub with draft approval workflow',
    images: ['/icons/icon-192.svg'],
  },
};

export const viewport: Viewport = {
  themeColor: '#6366F1',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" suppressHydrationWarning>
      {/* pb-16 sm:pb-0 — reserve space for BottomNav on mobile */}
      <body className="min-h-screen pb-16 sm:pb-0" suppressHydrationWarning>
        <ThemeProvider>
          <I18nProvider>
            <ChatProvider>
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
              <PwaInstallBanner />
              <ClientShell />
            </ChatProvider>
          </I18nProvider>
        </ThemeProvider>
        <PwaRegistrar />
        {/* Toast notifications — richColors auto-adapts to dark mode */}
        <Toaster
          position="top-center"
          richColors
          toastOptions={{
            duration: 3500,
            classNames: {
              toast: 'dark:!bg-gray-800 dark:!text-white dark:!border-gray-700',
            },
          }}
        />
      </body>
    </html>
  );
}
