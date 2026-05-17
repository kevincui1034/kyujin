import { NextResponse, after, type NextRequest } from 'next/server';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { backfillQueue, classifierUsage, emailMessages, users } from '@kyujin/db/schema';
import { auth } from '@/auth';
import {
  BACKFILL_WINDOWS,
  FREE_PLAN_MAX_DAYS,
  buildBackfillQuery,
  listJobMessageIds,
  listNylasClients,
  type BackfillWindow,
} from '@kyujin/shared/nylas';
import { runProcessBatch } from '@/lib/process-batch';
import { classifierCapForPlan } from '@/lib/plan';

// Nylas equivalent of /api/gmail/backfill. Same business rules (plan caps,
// 5h cooldown, classifier-cap soft-check, first-backfill drain) — only the
// message-listing call differs. backfill_queue rows are inserted with
// connectionId=null since that column FKs to gmail_connections; the worker
// resolves the Nylas connection via userId + EMAIL_PROVIDER instead.

export const maxDuration = 300;
const DRAIN_MAX_ITERATIONS = 200;
const BACKFILL_COOLDOWN_MS = 5 * 60 * 60 * 1000;
const PLAN_CAP: Record<'standard' | 'premium', number> = {
  standard: 1000,
  premium: 3000,
};

function isValidWindow(n: number): n is BackfillWindow {
  return (BACKFILL_WINDOWS as readonly number[]).includes(n);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

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

  const plan = user?.plan;
  if (plan !== 'standard' && plan !== 'premium') {
    return NextResponse.json({ error: 'payment_required' }, { status: 402 });
  }

  if (days > FREE_PLAN_MAX_DAYS && plan !== 'premium' && days > 240) {
    return NextResponse.json(
      { error: 'premium_required', maxStandardDays: 240 },
      { status: 402 },
    );
  }

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

  const handles = await listNylasClients(session.user.id);
  if (handles.length === 0) {
    return NextResponse.json({ error: 'no_email_connection' }, { status: 400 });
  }

  // Soft-check the rolling-30d classifier cap before enqueueing.
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
      { error: 'classifier_cap_reached', cap: monthlyCap, used: usedThisMonth, plan },
      { status: 429 },
    );
  }

  const cap = PLAN_CAP[plan];
  const query = buildBackfillQuery(days);

  // Stamp lastBackfillAt before any heavy work so a slow/crashing run still
  // counts against the cool-down.
  await db
    .update(users)
    .set({ lastBackfillAt: new Date(now) })
    .where(eq(users.id, session.user.id));

  let totalFound = 0;
  let enqueued = 0;
  const perInbox: { emailAddress: string; found: number; enqueued: number }[] = [];

  for (const handle of handles) {
    const ids = await listJobMessageIds(handle, query, cap);
    totalFound += ids.length;
    let inboxEnqueued = 0;
    if (ids.length > 0) {
      const rows = ids.map((gmailMessageId) => ({
        userId: session.user!.id,
        gmailMessageId,
        // connectionId left null — see file header.
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
    perInbox.push({ emailAddress: handle.emailAddress, found: ids.length, enqueued: inboxEnqueued });
  }

  // First-backfill drain — same pattern as the Gmail route.
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
