import type { Metadata, Viewport } from 'next';
import './globals.css';
import ChatWidget from '@/components/ChatWidget';
import I18nProvider from '@/components/I18nProvider';
import PwaInstallBanner from '@/components/PwaInstallBanner';
import PwaRegistrar from '@/components/PwaRegistrar';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ChatProvider } from '@/lib/chat-context';

export const metadata: Metadata = {
  title: 'CDP Communication Hub',
  description: 'AI-powered email communication hub with draft approval workflow',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'CDP Hub',
  },
  icons: {
    icon: '/icons/icon-192.svg',
    apple: '/icons/icon-192.svg',
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
      <body className="min-h-screen" suppressHydrationWarning>
        <ThemeProvider>
          <I18nProvider>
            <ChatProvider>
              {children}
              <ChatWidget />
              <PwaInstallBanner />
            </ChatProvider>
          </I18nProvider>
        </ThemeProvider>
        <PwaRegistrar />
      </body>
    </html>
  );
}
