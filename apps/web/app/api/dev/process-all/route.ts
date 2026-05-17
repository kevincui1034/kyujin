import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { runProcessBatch } from '@/lib/process-batch';

export const dynamic = 'force-dynamic';
// Vercel hard-caps serverless at 300s. Each runProcessBatch tick burns the
// per-item Gmail + LLM round-trip, so realistically this drains a few hundred
// messages per invocation before timing out.
export const maxDuration = 300;

// Safety cap so a misbehaving stop condition can't spin forever in dev.
const MAX_ITERATIONS = 200;

// Dev-only: repeatedly invoke runProcessBatch until the pending queue is
// empty (or the safety cap fires). 404 in production.
export async function POST(_req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const started = Date.now();
  let iterations = 0;
  let totalProcessed = 0;
  let totalFailed = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    iterations++;
    const res = await runProcessBatch();
    const data = (await res.json()) as {
      processed?: number;
      failed?: number;
      users?: number;
    };
    totalProcessed += data.processed ?? 0;
    totalFailed += data.failed ?? 0;
    // runProcessBatch short-circuits with no `users` field when the queue is
    // empty — that's our stop signal.
    if (data.users === undefined) break;
  }

  return NextResponse.json({
    iterations,
    totalProcessed,
    totalFailed,
    durationMs: Date.now() - started,
    hitCap: iterations >= MAX_ITERATIONS,
  });
}
