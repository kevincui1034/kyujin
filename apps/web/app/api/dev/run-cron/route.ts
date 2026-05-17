import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { runProcessBatch } from '@/lib/process-batch';
import { runRefreshWatches } from '@/lib/refresh-watches';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Dev-only helper that runs a cron job from the browser, gated by session
// instead of CRON_SECRET. Returns 404 in production so it can't be probed.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const job = new URL(req.url).searchParams.get('job');
  if (job === 'process-batch') return runProcessBatch();
  if (job === 'refresh-watches') return runRefreshWatches();
  return NextResponse.json(
    { error: 'job must be "process-batch" or "refresh-watches"' },
    { status: 400 },
  );
}
