import type { Metadata } from 'next';
import './globals.css';
import ChatWidget from '@/components/ChatWidget';
import I18nProvider from '@/components/I18nProvider';

export const metadata: Metadata = {
  title: 'CDP Communication Hub',
  description: 'AI-powered email communication hub with draft approval workflow',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body className="min-h-screen">
        <I18nProvider>
          {children}
          <ChatWidget />
        </I18nProvider>
      </body>
    </html>
  );
}
