import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kyujin — job application tracker',
  description:
    'Automatically tracks your job applications by reading confirmations, interviews, and rejections from your Gmail.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
