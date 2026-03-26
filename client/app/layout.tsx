import type { Metadata } from 'next';
import './globals.css';
import ChatWidget from '@/components/ChatWidget';

export const metadata: Metadata = {
  title: 'CDP Communication Hub',
  description: 'AI-powered email communication hub with draft approval workflow',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {children}
        <ChatWidget />
      </body>
    </html>
  );
}
