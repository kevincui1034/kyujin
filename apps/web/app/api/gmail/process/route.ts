import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { runProcessBatch } from '@/lib/process-batch';

export const dynamic = 'force-dynamic';
// Vercel hard-caps serverless at 300s. Each runProcessBatch tick burns the
// per-item Gmail + LLM round-trip, so one invocation realistically drains a few
// hundred messages before timing out.
export const maxDuration = 300;

// Safety cap so a stuck stop condition (e.g. items that keep re-queuing as
// pending after a user-level failure) can't spin forever.
const MAX_ITERATIONS = 200;

// Manually drain the backfill queue instead of waiting for the 5-minute cron
// tick. Session-gated (cookie) — this is the personal-use equivalent of the
// dev-only /api/dev/process-all, but it runs in production too. Loops
// runProcessBatch until the pending queue is empty or the safety cap fires.
//
// Note: runProcessBatch processes the *global* pending queue, not just the
// caller's rows. Fine for single-user personal use; revisit if this ever serves
// multiple accounts.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const started = Date.now();
  let iterations = 0;
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    iterations++;
    const res = await runProcessBatch();
    const data = (await res.json()) as {
      processed?: number;
      failed?: number;
      users?: number;
    };
    processed += data.processed ?? 0;
    failed += data.failed ?? 0;
    // runProcessBatch short-circuits with no `users` field when the queue is
    // empty — that's our stop signal.
    if (data.users === undefined) break;
  }

  return NextResponse.json({
    processed,
    failed,
    iterations,
    // false means we hit MAX_ITERATIONS with items still pending — caller
    // should run again to finish.
    drained: iterations < MAX_ITERATIONS,
    durationMs: Date.now() - started,
  });
}
