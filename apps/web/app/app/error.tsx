'use client';

import { useEffect } from 'react';
import { PillowCard } from '@/components/yume/pillow-card';
import { Button } from '@/components/ui/button';
import { log } from '@/lib/log';

// Authenticated-zone error boundary. Catches throws from any server or
// client component below /app. The Next.js default page is unstyled — this
// keeps the user inside the Yume shell with a working reset button.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Structured client-side log. Goes to the browser console and (in
    // production) to Vercel's client logging if observability is enabled.
    log.error({ kind: 'ui.app_error', digest: error.digest, cause: error.message });
  }, [error]);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 pt-12">
      <PillowCard tone="pink">
        <div className="flex flex-col gap-4 p-2">
          <h1 className="font-serif text-2xl text-yume-ink">Something went sideways</h1>
          <p className="text-sm" style={{ color: 'var(--yume-ink-muted)' }}>
            We hit an unexpected error loading this page. Try again, or head back to your
            dashboard.
          </p>
          <div className="flex gap-2">
            <Button onClick={reset} variant="default">
              Try again
            </Button>
            <Button asChild variant="outline">
              <a href="/app">Back to dashboard</a>
            </Button>
          </div>
        </div>
      </PillowCard>
    </div>
  );
}
