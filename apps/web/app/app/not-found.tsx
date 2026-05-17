import Link from 'next/link';
import { PillowCard } from '@/components/kyujin/pillow-card';
import { Button } from '@/components/ui/button';

// Authenticated-zone 404. Fires when a server component calls `notFound()`
// somewhere under /app and no nested not-found.tsx exists. Rendered inside
// the AppLayout so the nav stays visible.
export default function AppNotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 pt-12">
      <PillowCard tone="cream">
        <div className="flex flex-col gap-4 p-2">
          <h1 className="font-serif text-2xl text-kyujin-ink">Not found</h1>
          <p className="text-sm" style={{ color: 'var(--kyujin-ink-muted)' }}>
            We couldn't find what you were looking for. It may have been deleted, or the link
            might be wrong.
          </p>
          <div>
            <Button asChild variant="default">
              <Link href="/app">Back to dashboard</Link>
            </Button>
          </div>
        </div>
      </PillowCard>
    </div>
  );
}
