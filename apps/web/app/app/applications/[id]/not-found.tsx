import Link from 'next/link';
import { PillowCard } from '@/components/yume/pillow-card';
import { Button } from '@/components/ui/button';

// Specific 404 copy when the requested applicationId either doesn't exist
// or belongs to a different user. Both cases call `notFound()` from the
// page component (see lib/data.ts:getApplication).
export default function ApplicationNotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 pt-12">
      <PillowCard tone="cream">
        <div className="flex flex-col gap-4 p-2">
          <h1 className="font-serif text-2xl text-yume-ink">Application not found</h1>
          <p className="text-sm" style={{ color: 'var(--yume-ink-muted)' }}>
            That application either doesn't exist or isn't yours. It may have been merged
            into another, or deleted.
          </p>
          <div>
            <Button asChild variant="default">
              <Link href="/app">All applications</Link>
            </Button>
          </div>
        </div>
      </PillowCard>
    </div>
  );
}
