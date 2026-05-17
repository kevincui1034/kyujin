import type { Metadata } from 'next';
import { DM_Serif_Display, Geist, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const serif = DM_Serif_Display({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

const sans = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Yume — job application tracker',
  description:
    'Automatically tracks your job applications by reading confirmations, interviews, and rejections from your Gmail.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
    >
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
