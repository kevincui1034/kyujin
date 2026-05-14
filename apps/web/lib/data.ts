import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { applications, emailMessages, gmailConnections } from '@kyujin/db/schema';
import type { ApplicationStatus } from '@kyujin/shared';

const GHOST_THRESHOLD_DAYS = 30;

export async function listApplications(userId: string, status?: ApplicationStatus) {
  const where = status
    ? and(eq(applications.userId, userId), eq(applications.status, status))
    : eq(applications.userId, userId);
  return db
    .select()
    .from(applications)
    .where(where)
    .orderBy(desc(applications.lastEventAt))
    .limit(200);
}

export async function getApplication(userId: string, id: string) {
  const rows = await db
    .select()
    .from(applications)
    .where(and(eq(applications.userId, userId), eq(applications.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listEmailsForApplication(applicationId: string) {
  return db
    .select()
    .from(emailMessages)
    .where(eq(emailMessages.applicationId, applicationId))
    .orderBy(desc(emailMessages.receivedAt));
}

export async function getGmailConnection(userId: string) {
  const rows = await db
    .select()
    .from(gmailConnections)
    .where(eq(gmailConnections.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getStats(userId: string) {
  const ghostCutoff = new Date(Date.now() - GHOST_THRESHOLD_DAYS * 24 * 3600 * 1000);

  const rows = await db
    .select({
      status: applications.status,
      count: sql<number>`count(*)::int`.as('count'),
    })
    .from(applications)
    .where(eq(applications.userId, userId))
    .groupBy(applications.status);

  const byStatus: Record<ApplicationStatus, number> = {
    applied: 0,
    no_response: 0,
    interview: 0,
    rejected: 0,
    accepted: 0,
    obtained: 0,
  };
  for (const r of rows) byStatus[r.status] = Number(r.count);

  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const responded = byStatus.interview + byStatus.rejected + byStatus.accepted + byStatus.obtained;
  const responseRate = total > 0 ? responded / total : 0;

  // Ghost rate: applied >30 days ago, still no response
  const ghostRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(applications)
    .where(
      and(
        eq(applications.userId, userId),
        eq(applications.status, 'applied'),
        lt(applications.firstSeenAt, ghostCutoff),
      ),
    );
  const ghosted = Number(ghostRows[0]?.count ?? 0);
  const ghostRate = byStatus.applied > 0 ? ghosted / byStatus.applied : 0;

  return { byStatus, total, responseRate, ghostRate, ghosted };
}

export async function getTimeToRejectionHistogram(userId: string) {
  // Time between firstSeenAt and lastEventAt for applications that ended in rejection.
  const rows = await db
    .select({
      days: sql<number>`extract(epoch from (${applications.lastEventAt} - ${applications.firstSeenAt}))::int / 86400`,
    })
    .from(applications)
    .where(and(eq(applications.userId, userId), eq(applications.status, 'rejected')));

  const buckets = [
    { label: '0-3d', min: 0, max: 3, count: 0 },
    { label: '4-7d', min: 4, max: 7, count: 0 },
    { label: '8-14d', min: 8, max: 14, count: 0 },
    { label: '15-30d', min: 15, max: 30, count: 0 },
    { label: '>30d', min: 31, max: Infinity, count: 0 },
  ];
  for (const r of rows) {
    const days = Number(r.days ?? 0);
    const b = buckets.find((b) => days >= b.min && days <= b.max);
    if (b) b.count++;
  }
  return buckets;
}
