import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  not,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import {
  applications,
  emailMessages,
  gmailConnections,
  users,
} from '@kyujin/db/schema';
import type { ApplicationSource, ApplicationStatus } from '@kyujin/shared';
import { sourceMatchPatterns } from '@kyujin/shared';
import type { NodeColor, SankeyData } from '@/components/kyujin/sankey';

const GHOST_THRESHOLD_DAYS = 30;
const ACTIVE_THREAD_STATUSES: ApplicationStatus[] = ['interview', 'accepted'];
const RECENT_DAYS = 7;

export type ApplicationsSortKey = 'lastEvent' | 'company' | 'source';
export type ApplicationsSortDir = 'asc' | 'desc';
export type ApplicationsRangeKey = 'all' | '7d' | '30d' | '90d' | '365d';

const RANGE_DAYS: Record<Exclude<ApplicationsRangeKey, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '365d': 365,
};

export type InsightsRangeKey = 'week' | 'month' | 'all';

const INSIGHTS_RANGE_DAYS: Record<Exclude<InsightsRangeKey, 'all'>, number> = {
  week: 7,
  month: 30,
};

function insightsSince(range: InsightsRangeKey): Date | null {
  if (range === 'all') return null;
  return new Date(Date.now() - INSIGHTS_RANGE_DAYS[range] * 24 * 3600 * 1000);
}

export interface ListApplicationsOptions {
  status?: ApplicationStatus;
  source?: ApplicationSource;
  range?: ApplicationsRangeKey;
  q?: string;
  sort?: ApplicationsSortKey;
  dir?: ApplicationsSortDir;
  limit?: number;
  offset?: number;
  // Statuses to exclude when no explicit `status` filter is set. Used by
  // user-default "hide these statuses" preference. Ignored when `status` is
  // present (the explicit filter wins).
  excludeStatuses?: ApplicationStatus[];
}

function applicationsFilterConditions(
  userId: string,
  opts: Pick<ListApplicationsOptions, 'status' | 'source' | 'range' | 'q' | 'excludeStatuses'>,
): SQL[] {
  const { status, source, range = 'all', q, excludeStatuses } = opts;
  const conditions: SQL[] = [eq(applications.userId, userId)];
  if (status) {
    conditions.push(eq(applications.status, status));
  } else if (excludeStatuses && excludeStatuses.length > 0) {
    conditions.push(not(inArray(applications.status, excludeStatuses)));
  }
  if (range !== 'all') {
    const since = new Date(Date.now() - RANGE_DAYS[range] * 24 * 3600 * 1000);
    conditions.push(gte(applications.lastEventAt, since));
  }
  if (source) {
    const patterns = sourceMatchPatterns(source);
    if (patterns.length > 0) {
      const matches = patterns.map((p) => ilike(applications.sourceDomain, p));
      const combined = matches.length === 1 ? matches[0] : or(...matches);
      // 'other' = NOT in any of the named sources' patterns.
      if (combined) conditions.push(source === 'other' ? not(combined) : combined);
    }
  }
  const query = q?.trim();
  if (query) {
    // Escape LIKE wildcards. Drizzle parameterizes the value so injection
    // isn't on the table, but unescaped `%` / `_` from the user lets them
    // semantically alter the pattern (`%` matches everything, `_` is a
    // single-char wildcard). Backslash is the default escape in Postgres.
    const safe = query.replace(/[\\%_]/g, (c) => `\\${c}`);
    const term = `%${safe}%`;
    const searchClause = or(ilike(applications.company, term), ilike(applications.role, term));
    if (searchClause) conditions.push(searchClause);
  }
  return conditions;
}

export async function countApplications(
  userId: string,
  opts: Pick<
    ListApplicationsOptions,
    'status' | 'source' | 'range' | 'q' | 'excludeStatuses'
  > = {},
): Promise<number> {
  const conditions = applicationsFilterConditions(userId, opts);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(applications)
    .where(and(...conditions));
  return Number(row?.count ?? 0);
}

export async function listApplications(userId: string, opts: ListApplicationsOptions = {}) {
  const { sort = 'lastEvent', dir = 'desc', limit = 200, offset = 0 } = opts;
  const conditions = applicationsFilterConditions(userId, opts);

  const sortColumn =
    sort === 'company'
      ? applications.company
      : sort === 'source'
        ? applications.sourceDomain
        : applications.lastEventAt;
  const orderBy = dir === 'asc' ? asc(sortColumn) : desc(sortColumn);

  const rows = await db
    .select()
    .from(applications)
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  if (rows.length === 0) {
    return rows.map((r) => ({ ...r, inboxEmails: [] as string[] }));
  }

  // Resolve the inbox email(s) each application's emails came from. Threading
  // means an app usually has just one, but Gmail can occasionally fan out
  // across multiple inboxes — show them all so the user isn't surprised.
  const ids = rows.map((r) => r.id);
  const inboxRows = await db
    .selectDistinct({
      applicationId: emailMessages.applicationId,
      emailAddress: gmailConnections.emailAddress,
    })
    .from(emailMessages)
    .innerJoin(gmailConnections, eq(emailMessages.connectionId, gmailConnections.id))
    .where(inArray(emailMessages.applicationId, ids));

  const byApp = new Map<string, string[]>();
  for (const r of inboxRows) {
    if (!r.applicationId) continue;
    const arr = byApp.get(r.applicationId) ?? [];
    arr.push(r.emailAddress);
    byApp.set(r.applicationId, arr);
  }

  return rows.map((r) => ({ ...r, inboxEmails: byApp.get(r.id) ?? [] }));
}

export async function getApplication(userId: string, id: string) {
  const rows = await db
    .select()
    .from(applications)
    .where(and(eq(applications.userId, userId), eq(applications.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

// Emails for this application's timeline. The rule:
//   1. Include every email already linked via applicationId == this app.
//   2. Plus unclassified follow-ups (applicationId IS NULL) — but ONLY from
//      threads where this is the only application that owns any email.
//
// Gmail aggressively threads ATS notifications by sender+subject, so a single
// gmail_thread_id can span multiple roles at the same company. In that case we
// can't tell which app an unclassified follow-up actually belongs to, so we
// leave it out of both timelines rather than show it in both.
export async function listEmailsForApplication(userId: string, applicationId: string) {
  const myThreadRows = await db
    .selectDistinct({ threadId: emailMessages.gmailThreadId })
    .from(emailMessages)
    .where(eq(emailMessages.applicationId, applicationId));
  const myThreadIds = myThreadRows.map((r) => r.threadId).filter(Boolean);

  let cleanThreadIds: string[] = [];
  if (myThreadIds.length > 0) {
    const contentious = await db
      .selectDistinct({ threadId: emailMessages.gmailThreadId })
      .from(emailMessages)
      .where(
        and(
          eq(emailMessages.userId, userId),
          inArray(emailMessages.gmailThreadId, myThreadIds),
          isNotNull(emailMessages.applicationId),
          not(eq(emailMessages.applicationId, applicationId)),
        ),
      );
    const contentiousSet = new Set(contentious.map((r) => r.threadId));
    cleanThreadIds = myThreadIds.filter((id) => !contentiousSet.has(id));
  }

  const condition =
    cleanThreadIds.length > 0
      ? or(
          eq(emailMessages.applicationId, applicationId),
          and(
            isNull(emailMessages.applicationId),
            inArray(emailMessages.gmailThreadId, cleanThreadIds),
          ),
        )
      : eq(emailMessages.applicationId, applicationId);

  return db
    .select()
    .from(emailMessages)
    .where(and(eq(emailMessages.userId, userId), condition!))
    // Manual order (display_order) first; rows without an explicit position
    // fall through to chronological. Once the user drags the timeline, the
    // reorder endpoint stamps positions onto every visible email, so the
    // mix only matters for newly-arrived emails (which append to the end).
    .orderBy(sql`${emailMessages.displayOrder} ASC NULLS LAST`, asc(emailMessages.receivedAt));
}

export async function listGmailConnectionEmails(userId: string) {
  return db
    .select({ id: gmailConnections.id, emailAddress: gmailConnections.emailAddress })
    .from(gmailConnections)
    .where(eq(gmailConnections.userId, userId))
    .orderBy(asc(gmailConnections.createdAt));
}

export async function getUserProfile(userId: string) {
  const [row] = await db
    .select({
      name: users.name,
      email: users.email,
      plan: users.plan,
      applicationGoal: users.applicationGoal,
      dashboardView: users.dashboardView,
      defaultAppSort: users.defaultAppSort,
      defaultAppRange: users.defaultAppRange,
      defaultAppDir: users.defaultAppDir,
      hideStatuses: users.hideStatuses,
      stripeCustomerId: users.stripeCustomerId,
      stripeSubscriptionId: users.stripeSubscriptionId,
      stripeSubscriptionStatus: users.stripeSubscriptionStatus,
      stripePriceId: users.stripePriceId,
      stripeCurrentPeriodEnd: users.stripeCurrentPeriodEnd,
      stripeCancelAtPeriodEnd: users.stripeCancelAtPeriodEnd,
      appleOriginalTransactionId: users.appleOriginalTransactionId,
      appleProductId: users.appleProductId,
      appleSubscriptionStatus: users.appleSubscriptionStatus,
      appleExpiresAt: users.appleExpiresAt,
      appleAutoRenewEnabled: users.appleAutoRenewEnabled,
      appleEnvironment: users.appleEnvironment,
      appleInIntroOffer: users.appleInIntroOffer,
      trialUsedAt: users.trialUsedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

// Every other application owned by the user, projected with the fields the
// merge picker needs to preview the target (status, dates, email count,
// source). Capped because this is a UI scroll list — 500 rows is generous.
export async function listOtherApplicationsForPicker(userId: string, excludeId: string) {
  const counts = await db
    .select({
      applicationId: emailMessages.applicationId,
      count: sql<number>`count(*)::int`.as('count'),
    })
    .from(emailMessages)
    .where(eq(emailMessages.userId, userId))
    .groupBy(emailMessages.applicationId);
  const countMap = new Map<string, number>();
  for (const c of counts) {
    if (c.applicationId) countMap.set(c.applicationId, Number(c.count));
  }
  const rows = await db
    .select({
      id: applications.id,
      company: applications.company,
      role: applications.role,
      status: applications.status,
      lastEventAt: applications.lastEventAt,
      firstSeenAt: applications.firstSeenAt,
      sourceDomain: applications.sourceDomain,
    })
    .from(applications)
    .where(eq(applications.userId, userId))
    .orderBy(desc(applications.lastEventAt))
    .limit(500);
  return rows
    .filter((r) => r.id !== excludeId)
    .map((r) => ({
      ...r,
      emailCount: countMap.get(r.id) ?? 0,
      lastEventAt: r.lastEventAt.toISOString(),
      firstSeenAt: r.firstSeenAt.toISOString(),
    }));
}

export async function getGmailConnection(userId: string) {
  const rows = await db
    .select()
    .from(gmailConnections)
    .where(eq(gmailConnections.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listGmailConnections(userId: string) {
  return db
    .select()
    .from(gmailConnections)
    .where(eq(gmailConnections.userId, userId))
    .orderBy(asc(gmailConnections.createdAt));
}

export type InboxConnection = {
  id: string;
  emailAddress: string;
  watchExpiration: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function listInboxConnections(userId: string): Promise<InboxConnection[]> {
  const rows = await db
    .select({
      id: gmailConnections.id,
      emailAddress: gmailConnections.emailAddress,
      watchExpiration: gmailConnections.watchExpiration,
      createdAt: gmailConnections.createdAt,
      updatedAt: gmailConnections.updatedAt,
    })
    .from(gmailConnections)
    .where(eq(gmailConnections.userId, userId))
    .orderBy(asc(gmailConnections.createdAt));
  return rows.map((r) => ({
    id: r.id,
    emailAddress: r.emailAddress,
    watchExpiration: r.watchExpiration,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function getStats(userId: string, range: InsightsRangeKey = 'all') {
  const ghostCutoff = new Date(Date.now() - GHOST_THRESHOLD_DAYS * 24 * 3600 * 1000);
  const since = insightsSince(range);

  const statsConditions: SQL[] = [eq(applications.userId, userId)];
  if (since) statsConditions.push(gte(applications.firstSeenAt, since));

  const rows = await db
    .select({
      status: applications.status,
      count: sql<number>`count(*)::int`.as('count'),
    })
    .from(applications)
    .where(and(...statsConditions))
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

  // Ghost rate: applied >30 days ago, still no response. Range scopes the
  // numerator (apps started in the window AND past the ghost cutoff).
  const ghostConditions: SQL[] = [
    eq(applications.userId, userId),
    eq(applications.status, 'applied'),
    lt(applications.firstSeenAt, ghostCutoff),
  ];
  if (since) ghostConditions.push(gte(applications.firstSeenAt, since));
  const ghostRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(applications)
    .where(and(...ghostConditions));
  const ghosted = Number(ghostRows[0]?.count ?? 0);
  const ghostRate = byStatus.applied > 0 ? ghosted / byStatus.applied : 0;

  return { byStatus, total, responseRate, ghostRate, ghosted };
}

export async function getActiveThreads(userId: string, limit = 4) {
  return db
    .select()
    .from(applications)
    .where(and(eq(applications.userId, userId), inArray(applications.status, ACTIVE_THREAD_STATUSES)))
    .orderBy(desc(applications.lastEventAt))
    .limit(limit);
}

export async function getRecentEvents(userId: string, days = RECENT_DAYS, limit = 5) {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  return db
    .select()
    .from(applications)
    .where(and(eq(applications.userId, userId), gte(applications.lastEventAt, since)))
    .orderBy(desc(applications.lastEventAt))
    .limit(limit);
}

export async function getFunnel(
  userId: string,
  range: InsightsRangeKey = 'all',
): Promise<SankeyData> {
  const { byStatus } = await getStats(userId, range);
  const interviewedTotal = byStatus.interview + byStatus.accepted + byStatus.obtained;
  const offeredTotal = byStatus.accepted + byStatus.obtained;

  const allNodes: { id: string; label: string; color: NodeColor }[] = [
    { id: 'apps', label: 'Applications', color: 'pink' },
    { id: 'pending', label: 'Still applied', color: 'butter' },
    { id: 'ghosted', label: 'No answer', color: 'pinkD' },
    { id: 'rejected_pre', label: 'Rejected', color: 'peach' },
    { id: 'interview', label: 'Interview', color: 'mint' },
    { id: 'interviewing', label: 'Still interviewing', color: 'mint' },
    { id: 'offered', label: 'Offer received', color: 'pinkD' },
    { id: 'pending_decision', label: 'Pending decision', color: 'lilac' },
    { id: 'accepted', label: 'Accepted', color: 'pinkXD' },
  ];

  const links: { source: string; target: string; value: number }[] = [];
  const push = (source: string, target: string, value: number) => {
    if (value > 0) links.push({ source, target, value });
  };
  push('apps', 'pending', byStatus.applied);
  push('apps', 'ghosted', byStatus.no_response);
  push('apps', 'rejected_pre', byStatus.rejected);
  push('apps', 'interview', interviewedTotal);
  push('interview', 'interviewing', byStatus.interview);
  push('interview', 'offered', offeredTotal);
  push('offered', 'pending_decision', byStatus.accepted);
  push('offered', 'accepted', byStatus.obtained);

  const referenced = new Set<string>();
  for (const l of links) {
    referenced.add(l.source);
    referenced.add(l.target);
  }
  return {
    nodes: allNodes.filter((n) => referenced.has(n.id)),
    links,
  };
}

export async function getRejectionMedianDays(
  userId: string,
  range: InsightsRangeKey = 'all',
): Promise<number | null> {
  const since = insightsSince(range);
  const conditions: SQL[] = [
    eq(applications.userId, userId),
    eq(applications.status, 'rejected'),
  ];
  if (since) conditions.push(gte(applications.firstSeenAt, since));
  const rows = await db
    .select({
      days: sql<number>`extract(epoch from (${applications.lastEventAt} - ${applications.firstSeenAt}))::int / 86400`,
    })
    .from(applications)
    .where(and(...conditions));
  if (rows.length === 0) return null;
  const sorted = rows.map((r) => Number(r.days ?? 0)).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    const a = sorted[mid - 1] ?? 0;
    const b = sorted[mid] ?? 0;
    return Math.round((a + b) / 2);
  }
  return sorted[mid] ?? null;
}

export interface HistogramBucket {
  label: string;
  count: number;
}

export async function getTimeToRejectionHistogram(
  userId: string,
  range: InsightsRangeKey = 'all',
): Promise<HistogramBucket[]> {
  // Time between firstSeenAt and lastEventAt for applications that ended in rejection.
  const since = insightsSince(range);
  const conditions: SQL[] = [
    eq(applications.userId, userId),
    eq(applications.status, 'rejected'),
  ];
  if (since) conditions.push(gte(applications.firstSeenAt, since));
  const rows = await db
    .select({
      days: sql<number>`extract(epoch from (${applications.lastEventAt} - ${applications.firstSeenAt}))::int / 86400`,
    })
    .from(applications)
    .where(and(...conditions));

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
  return buckets.map((b) => ({ label: b.label, count: b.count }));
}

export interface ActivityBucket {
  label: string;
  count: number;
}

export async function getActivityOverTime(
  userId: string,
  range: InsightsRangeKey = 'all',
): Promise<ActivityBucket[]> {
  // Bucket granularity follows the range: 7 daily bars for week, 4 weekly bars
  // for month, monthly bars stretching back to the user's first application
  // for all. Empty leading buckets are kept so the x-axis reads as a real
  // timeline rather than just "non-zero days."
  if (range === 'week') return getDailyActivity(userId, 7);
  if (range === 'month') return getWeeklyActivity(userId, 4);
  return getMonthlyActivity(userId);
}

async function getDailyActivity(userId: string, days: number): Promise<ActivityBucket[]> {
  const since = startOfDay(new Date(Date.now() - (days - 1) * 24 * 3600 * 1000));
  const rows = await db
    .select({
      bucket: sql<string>`date_trunc('day', ${applications.firstSeenAt})::date::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(applications)
    .where(and(eq(applications.userId, userId), gte(applications.firstSeenAt, since)))
    .groupBy(sql`date_trunc('day', ${applications.firstSeenAt})`);
  const counts = new Map(rows.map((r) => [r.bucket, Number(r.count)]));
  const out: ActivityBucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    const key = d.toISOString().slice(0, 10);
    out.push({
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      count: counts.get(key) ?? 0,
    });
  }
  return out;
}

async function getWeeklyActivity(userId: string, weeks: number): Promise<ActivityBucket[]> {
  const since = startOfDay(new Date(Date.now() - (weeks * 7 - 1) * 24 * 3600 * 1000));
  const rows = await db
    .select({ firstSeenAt: applications.firstSeenAt })
    .from(applications)
    .where(and(eq(applications.userId, userId), gte(applications.firstSeenAt, since)));
  const buckets: ActivityBucket[] = [];
  const now = new Date();
  for (let i = weeks - 1; i >= 0; i--) {
    const end = new Date(now.getTime() - i * 7 * 24 * 3600 * 1000);
    const start = new Date(end.getTime() - 6 * 24 * 3600 * 1000);
    const startMs = startOfDay(start).getTime();
    const endMs = end.getTime() + 24 * 3600 * 1000;
    let count = 0;
    for (const r of rows) {
      const t = r.firstSeenAt.getTime();
      if (t >= startMs && t < endMs) count++;
    }
    buckets.push({
      label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count,
    });
  }
  return buckets;
}

async function getMonthlyActivity(userId: string): Promise<ActivityBucket[]> {
  const rows = await db
    .select({
      bucket: sql<string>`to_char(date_trunc('month', ${applications.firstSeenAt}), 'YYYY-MM')`,
      count: sql<number>`count(*)::int`,
    })
    .from(applications)
    .where(eq(applications.userId, userId))
    .groupBy(sql`date_trunc('month', ${applications.firstSeenAt})`)
    .orderBy(sql`date_trunc('month', ${applications.firstSeenAt}) asc`);
  if (rows.length === 0) return [];
  const counts = new Map(rows.map((r) => [r.bucket, Number(r.count)]));
  const first = rows[0]!.bucket;
  const [fyStr, fmStr] = first.split('-');
  let y = Number(fyStr);
  let m = Number(fmStr);
  const now = new Date();
  const endY = now.getFullYear();
  const endM = now.getMonth() + 1;
  const out: ActivityBucket[] = [];
  while (y < endY || (y === endY && m <= endM)) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const labelDate = new Date(y, m - 1, 1);
    out.push({
      label: labelDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      count: counts.get(key) ?? 0,
    });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
