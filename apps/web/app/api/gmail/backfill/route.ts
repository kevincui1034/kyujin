import { NextResponse, after, type NextRequest } from 'next/server';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { backfillQueue, classifierUsage, emailMessages, users } from '@kyujin/db/schema';
import { auth } from '@/auth';
import {
  BACKFILL_WINDOWS,
  FREE_PLAN_MAX_DAYS,
  buildBackfillQuery,
  listGmailClients,
  listJobMessageIds,
  type BackfillWindow,
} from '@kyujin/shared/gmail';
import { runProcessBatch } from '@/lib/process-batch';
import { classifierCapForPlan } from '@/lib/plan';

// Bumped from 60 → 300 so first-backfill users can drain their full queue in
// the after() hook (which still counts against the function's wall time).
export const maxDuration = 300;

// Safety cap on the drain loop so a stuck stop condition can't spin forever.
const DRAIN_MAX_ITERATIONS = 200;

// Cool-down between manual backfills. Idempotency on backfill_queue already
// stops a re-run of the same window from re-classifying, but a user could
// widen the window or disconnect/reconnect to burn classifier credits. The
// 5h gate is the floor on that.
const BACKFILL_COOLDOWN_MS = 5 * 60 * 60 * 1000;

// Per-plan message cap. The Gmail query is already job-filtered, so most
// pulled messages hit the classifier. Standard caps at 1000 (~$0.14 of LLM
// per backfill), Premium at 3000 (~$0.42).
const PLAN_CAP: Record<'standard' | 'premium', number> = {
  standard: 1000,
  premium: 3000,
};

function isValidWindow(n: number): n is BackfillWindow {
  return (BACKFILL_WINDOWS as readonly number[]).includes(n);
}

// Gmail refresh tokens die after 7 days while our OAuth app is unverified
// ("Testing" status, pending the CASA Tier-2 audit). When that happens the SDK
// throws `invalid_grant` from refreshAccessToken(). Detect it so we can tell the
// user to reconnect instead of returning an opaque empty 500.
function isGmailReauthError(err: unknown): boolean {
  const e = err as { response?: { data?: { error?: string } }; message?: string };
  const code = e?.response?.data?.error;
  if (code === 'invalid_grant' || code === 'unauthorized_client') return true;
  return typeof e?.message === 'string' && e.message.includes('invalid_grant');
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // Default to 90d (the original behavior) when no body is sent.
  let days: number = 90;
  try {
    const body = (await req.json()) as { days?: number };
    if (typeof body.days === 'number') days = body.days;
  } catch {
    // empty body — keep default
  }
  if (!isValidWindow(days)) {
    return NextResponse.json(
      { error: `days must be one of ${BACKFILL_WINDOWS.join(', ')}` },
      { status: 400 },
    );
  }

  const [user] = await db
    .select({ plan: users.plan, lastBackfillAt: users.lastBackfillAt })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  // Only paid plans can backfill. Free / unpaid accounts get 402 so the
  // client can route them to the upgrade flow.
  const plan = user?.plan;
  if (plan !== 'standard' && plan !== 'premium') {
    return NextResponse.json({ error: 'payment_required' }, { status: 402 });
  }

  // 365-day window stays gated to Premium. Standard tops out at 240 (the
  // next-loosest BACKFILL_WINDOWS entry).
  if (days > FREE_PLAN_MAX_DAYS && plan !== 'premium' && days > 240) {
    return NextResponse.json(
      { error: 'premium_required', maxStandardDays: 240 },
      { status: 402 },
    );
  }

  // 5-hour cool-down enforced strictly: even a backfill that enqueued
  // nothing counts, because the rate-limit's goal is to bound Gmail-API and
  // classifier load, not just successful inserts.
  const now = Date.now();
  if (user?.lastBackfillAt) {
    const elapsed = now - user.lastBackfillAt.getTime();
    if (elapsed < BACKFILL_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((BACKFILL_COOLDOWN_MS - elapsed) / 1000);
      return NextResponse.json(
        { error: 'rate_limited', retryAfterSeconds, cooldownHours: 5 },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
      );
    }
  }

  // Build the Gmail clients up front. This is where token refresh happens, so
  // an expired/revoked refresh token surfaces here as `invalid_grant`. Catch it
  // and return a structured error — this runs *before* the cool-down stamp, so
  // a reauth failure doesn't burn the user's 5h window.
  let clients: Awaited<ReturnType<typeof listGmailClients>>;
  try {
    clients = await listGmailClients(session.user.id);
  } catch (err) {
    if (isGmailReauthError(err)) {
      return NextResponse.json(
        {
          error: 'gmail_reauth_required',
          message: 'Your Gmail connection expired. Reconnect Gmail in settings and try again.',
        },
        { status: 401 },
      );
    }
    console.error('[backfill] failed to build Gmail clients', err);
    return NextResponse.json(
      { error: 'gmail_error', message: 'Could not reach Gmail. Try again in a moment.' },
      { status: 502 },
    );
  }
  if (clients.length === 0) {
    return NextResponse.json({ error: 'no_gmail_connection' }, { status: 400 });
  }

  // Soft-check the rolling-30d classifier cap before enqueueing. The worker
  // also enforces this per-item (defense in depth for live inbox traffic),
  // but checking here lets a capped user see a clear 429 instead of watching
  // queue items quietly fail over the next 10 minutes.
  const monthlyCap = classifierCapForPlan(plan);
  const usageSince = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const [usageRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(classifierUsage)
    .where(
      and(eq(classifierUsage.userId, session.user.id), gte(classifierUsage.createdAt, usageSince)),
    );
  const usedThisMonth = usageRow?.count ?? 0;
  if (usedThisMonth >= monthlyCap) {
    return NextResponse.json(
      {
        error: 'classifier_cap_reached',
        cap: monthlyCap,
        used: usedThisMonth,
        plan,
      },
      { status: 429 },
    );
  }

  // Per-plan flat cap (replaces the old per-window scaling). Premium pays
  // $10.99/mo for the 3× ceiling.
  const cap = PLAN_CAP[plan];
  const query = buildBackfillQuery(days);

  // Stamp lastBackfillAt before any heavy work so a slow/crashing run still
  // counts against the cool-down. Worst case the user retries in 5 hours.
  await db
    .update(users)
    .set({ lastBackfillAt: new Date(now) })
    .where(eq(users.id, session.user.id));

  let totalFound = 0;
  let enqueued = 0;
  const perInbox: { emailAddress: string; found: number; enqueued: number }[] = [];

  try {
    for (const client of clients) {
      const ids = await listJobMessageIds(client.gmail, query, cap);
      totalFound += ids.length;
      let inboxEnqueued = 0;
      if (ids.length > 0) {
        const rows = ids.map((gmailMessageId) => ({
          userId: session.user!.id,
          gmailMessageId,
          connectionId: client.connectionId,
        }));
        const CHUNK = 100;
        for (let i = 0; i < rows.length; i += CHUNK) {
          const slice = rows.slice(i, i + CHUNK);
          const inserted = await db
            .insert(backfillQueue)
            .values(slice)
            .onConflictDoNothing()
            .returning({ id: backfillQueue.id });
          inboxEnqueued += inserted.length;
        }
      }
      enqueued += inboxEnqueued;
      perInbox.push({ emailAddress: client.emailAddress, found: ids.length, enqueued: inboxEnqueued });
    }
  } catch (err) {
    if (isGmailReauthError(err)) {
      return NextResponse.json(
        {
          error: 'gmail_reauth_required',
          message: 'Your Gmail connection expired. Reconnect Gmail in settings and try again.',
        },
        { status: 401 },
      );
    }
    console.error('[backfill] failed while listing/enqueueing messages', err);
    return NextResponse.json(
      { error: 'gmail_error', message: 'Could not reach Gmail. Try again in a moment.' },
      { status: 502 },
    );
  }

  // First backfill = user has never had an email_messages row before. On the
  // first run we drain the queue in the background (via after()) so the user
  // sees applications appear on their dashboard within this session instead
  // of waiting up to ~10 minutes for the next cron tick. Subsequent backfills
  // fall back to the regular cron cadence.
  const [existingEmail] = await db
    .select({ id: emailMessages.id })
    .from(emailMessages)
    .where(eq(emailMessages.userId, session.user.id))
    .limit(1);
  const firstBackfill = !existingEmail && enqueued > 0;

  if (firstBackfill) {
    after(async () => {
      for (let i = 0; i < DRAIN_MAX_ITERATIONS; i++) {
        const res = await runProcessBatch();
        const data = (await res.json()) as { users?: number };
        // runProcessBatch short-circuits with no `users` field when the queue
        // is empty — that's our stop signal.
        if (data.users === undefined) break;
      }
    });
  }

  return NextResponse.json({
    enqueued,
    found: totalFound,
    days,
    inboxes: perInbox,
    firstBackfill,
  });
}
