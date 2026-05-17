import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { users } from '@kyujin/db/schema';
import { auth } from '@/auth';
import { APPLICATION_STATUSES, type ApplicationStatus } from '@kyujin/shared';

export const dynamic = 'force-dynamic';

const MAX_NAME_LEN = 30;
const NAME_RE = /^[A-Za-z0-9]+$/;
const MIN_GOAL = 1;
const MAX_GOAL = 9999;
const DASHBOARD_VIEWS = ['flow', 'activity', 'outcomes'] as const;
const APP_SORTS = ['lastEvent', 'company', 'source'] as const;
const APP_RANGES = ['all', '7d', '30d', '90d', '365d'] as const;
const APP_DIRS = ['asc', 'desc'] as const;

type DashboardView = (typeof DASHBOARD_VIEWS)[number];
type AppSort = (typeof APP_SORTS)[number];
type AppRange = (typeof APP_RANGES)[number];
type AppDir = (typeof APP_DIRS)[number];

function isIn<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
}

function isStatusArray(v: unknown): v is ApplicationStatus[] {
  return (
    Array.isArray(v) &&
    v.every((x) => typeof x === 'string' && (APPLICATION_STATUSES as readonly string[]).includes(x))
  );
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    name?: string | null;
    applicationGoal?: number;
    dashboardView?: string;
    defaultAppSort?: string;
    defaultAppRange?: string;
    defaultAppDir?: string;
    hideStatuses?: string[];
  } | null;
  if (!body) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const updates: {
    name?: string | null;
    applicationGoal?: number;
    dashboardView?: DashboardView;
    defaultAppSort?: AppSort;
    defaultAppRange?: AppRange;
    defaultAppDir?: AppDir;
    hideStatuses?: ApplicationStatus[];
  } = {};

  if ('name' in body) {
    const raw = body.name;
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (trimmed.length > MAX_NAME_LEN) {
      return NextResponse.json(
        { error: 'name_too_long', hint: `max ${MAX_NAME_LEN} characters` },
        { status: 400 },
      );
    }
    if (trimmed.length > 0 && !NAME_RE.test(trimmed)) {
      return NextResponse.json(
        { error: 'invalid_name', hint: 'letters and numbers only' },
        { status: 400 },
      );
    }
    updates.name = trimmed.length === 0 ? null : trimmed;
  }

  if ('applicationGoal' in body) {
    const n = Number(body.applicationGoal);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < MIN_GOAL || n > MAX_GOAL) {
      return NextResponse.json(
        { error: 'invalid_goal', hint: `whole number between ${MIN_GOAL} and ${MAX_GOAL}` },
        { status: 400 },
      );
    }
    updates.applicationGoal = n;
  }

  if ('dashboardView' in body) {
    if (!isIn(DASHBOARD_VIEWS, body.dashboardView)) {
      return NextResponse.json(
        { error: 'invalid_view', hint: `one of: ${DASHBOARD_VIEWS.join(', ')}` },
        { status: 400 },
      );
    }
    updates.dashboardView = body.dashboardView;
  }

  if ('defaultAppSort' in body) {
    if (!isIn(APP_SORTS, body.defaultAppSort)) {
      return NextResponse.json(
        { error: 'invalid_sort', hint: `one of: ${APP_SORTS.join(', ')}` },
        { status: 400 },
      );
    }
    updates.defaultAppSort = body.defaultAppSort;
  }

  if ('defaultAppRange' in body) {
    if (!isIn(APP_RANGES, body.defaultAppRange)) {
      return NextResponse.json(
        { error: 'invalid_range', hint: `one of: ${APP_RANGES.join(', ')}` },
        { status: 400 },
      );
    }
    updates.defaultAppRange = body.defaultAppRange;
  }

  if ('defaultAppDir' in body) {
    if (!isIn(APP_DIRS, body.defaultAppDir)) {
      return NextResponse.json(
        { error: 'invalid_dir', hint: `one of: ${APP_DIRS.join(', ')}` },
        { status: 400 },
      );
    }
    updates.defaultAppDir = body.defaultAppDir;
  }

  if ('hideStatuses' in body) {
    if (!isStatusArray(body.hideStatuses)) {
      return NextResponse.json(
        { error: 'invalid_hide_statuses', hint: 'array of valid statuses' },
        { status: 400 },
      );
    }
    // Dedupe so the column stays tidy.
    updates.hideStatuses = Array.from(new Set(body.hideStatuses));
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 });
  }

  await db.update(users).set(updates).where(eq(users.id, session.user.id));
  return NextResponse.json({ ok: true, ...updates });
}
