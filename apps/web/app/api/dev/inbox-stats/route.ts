import { NextResponse, type NextRequest } from 'next/server';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import {
  applications,
  backfillQueue,
  classifications,
  emailMessages,
  gmailConnections,
} from '@kyujin/db/schema';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

// Dev-only: per-inbox health and ingestion stats. Useful for figuring out why
// a second connected Gmail account isn't producing applications: did backfill
// enqueue anything? Are queue items failing? Are classifications coming back
// `ignore`? Returns 404 in production.
export async function GET(_req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const userId = session.user.id;

  const conns = await db
    .select()
    .from(gmailConnections)
    .where(eq(gmailConnections.userId, userId));

  // Queue state per connection (NULL connection_id = legacy single-inbox rows).
  const queueRows = await db
    .select({
      connectionId: backfillQueue.connectionId,
      state: backfillQueue.state,
      count: sql<number>`count(*)::int`,
    })
    .from(backfillQueue)
    .where(eq(backfillQueue.userId, userId))
    .groupBy(backfillQueue.connectionId, backfillQueue.state);

  // Latest 5 errors per connection.
  const errorRows = await db
    .select({
      connectionId: backfillQueue.connectionId,
      gmailMessageId: backfillQueue.gmailMessageId,
      lastError: backfillQueue.lastError,
      enqueuedAt: backfillQueue.enqueuedAt,
    })
    .from(backfillQueue)
    .where(and(eq(backfillQueue.userId, userId), isNotNull(backfillQueue.lastError)))
    .orderBy(desc(backfillQueue.enqueuedAt))
    .limit(20);

  // Email + classification counts can't be linked back to a connection
  // directly (email_messages has no connection_id column), so aggregate them
  // overall to confirm whether the pipeline is producing anything.
  const [emailCounts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      classified: sql<number>`count(*) filter (where ${emailMessages.classifiedAt} is not null)::int`,
      linked: sql<number>`count(*) filter (where ${emailMessages.applicationId} is not null)::int`,
    })
    .from(emailMessages)
    .where(eq(emailMessages.userId, userId));

  // Classifications grouped by label tell us how many emails the LLM/regex
  // path actually treated as job events vs ignored.
  const labelRows = await db
    .select({
      label: classifications.label,
      count: sql<number>`count(*)::int`,
    })
    .from(classifications)
    .innerJoin(emailMessages, eq(emailMessages.id, classifications.emailMessageId))
    .where(eq(emailMessages.userId, userId))
    .groupBy(classifications.label);

  // Unclassified email messages — those that hit the cron but didn't end up
  // in `classifications`. Counts both filtered-out (likely sender filter) and
  // genuinely unprocessed.
  const [unclassified] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailMessages)
    .where(and(eq(emailMessages.userId, userId), isNull(emailMessages.classifiedAt)));

  const [appCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(applications)
    .where(eq(applications.userId, userId));

  // Per-connection classification breakdown. We join the queue (which knows
  // connection_id) back to emails (which know classifiedAt) and to
  // classifications (which know the label). `ignored` = emails created but
  // never classified, which is what `classify()` returns "ignore" maps to.
  const perInboxRows = await db
    .select({
      connectionId: backfillQueue.connectionId,
      classifiedAt: emailMessages.classifiedAt,
      applicationId: emailMessages.applicationId,
      label: classifications.label,
    })
    .from(backfillQueue)
    .leftJoin(
      emailMessages,
      and(
        eq(emailMessages.userId, userId),
        eq(emailMessages.gmailMessageId, backfillQueue.gmailMessageId),
      ),
    )
    .leftJoin(classifications, eq(classifications.emailMessageId, emailMessages.id))
    .where(eq(backfillQueue.userId, userId));

  const inboxes = conns.map((c) => {
    const states = queueRows.filter((r) => r.connectionId === c.id);
    const counts: Record<string, number> = { pending: 0, processing: 0, done: 0, failed: 0 };
    for (const s of states) counts[s.state] = Number(s.count);

    const rows = perInboxRows.filter((r) => r.connectionId === c.id);
    const labelBreakdown: Record<string, number> = {};
    let ignored = 0;
    let linkedToApplication = 0;
    const distinctApps = new Set<string>();
    for (const r of rows) {
      if (r.label) labelBreakdown[r.label] = (labelBreakdown[r.label] ?? 0) + 1;
      else if (r.classifiedAt == null) ignored++;
      if (r.applicationId) {
        linkedToApplication++;
        distinctApps.add(r.applicationId);
      }
    }

    return {
      id: c.id,
      emailAddress: c.emailAddress,
      createdAt: c.createdAt,
      watchExpiration: c.watchExpiration,
      queue: counts,
      classifications: labelBreakdown,
      ignoredByClassifier: ignored,
      linkedToApplication,
      distinctApplications: distinctApps.size,
    };
  });

  const legacyStates = queueRows.filter((r) => r.connectionId === null);
  const legacyCounts: Record<string, number> = { pending: 0, processing: 0, done: 0, failed: 0 };
  for (const s of legacyStates) legacyCounts[s.state] = Number(s.count);

  return NextResponse.json({
    inboxes,
    legacyQueue: legacyCounts,
    emails: {
      total: Number(emailCounts?.total ?? 0),
      classified: Number(emailCounts?.classified ?? 0),
      linkedToApplication: Number(emailCounts?.linked ?? 0),
      unclassified: Number(unclassified?.count ?? 0),
    },
    classificationsByLabel: Object.fromEntries(labelRows.map((r) => [r.label, Number(r.count)])),
    applicationsTotal: Number(appCount?.count ?? 0),
    recentErrors: errorRows.map((r) => ({
      connectionId: r.connectionId,
      gmailMessageId: r.gmailMessageId,
      enqueuedAt: r.enqueuedAt,
      lastError: r.lastError,
    })),
  });
}
