import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { users } from '@kyujin/db/schema';
import { auth } from '@/auth';
import { APPLICATION_STATUSES } from '@kyujin/shared';
import { apiError } from '@/lib/api-errors';
import { validateBody, z } from '@/lib/with-validated-body';

export const dynamic = 'force-dynamic';

const MAX_NAME_LEN = 30;
const NAME_RE = /^[A-Za-z0-9]+$/;
const MIN_GOAL = 1;
const MAX_GOAL = 9999;
const DASHBOARD_VIEWS = ['flow', 'activity', 'outcomes'] as const;
const APP_SORTS = ['lastEvent', 'company', 'source'] as const;
const APP_RANGES = ['all', '7d', '30d', '90d', '365d'] as const;
const APP_DIRS = ['asc', 'desc'] as const;

// Each field is optional; the PATCH applies only the fields present in the
// body. `null` on `name` clears the column.
const bodySchema = z
  .object({
    name: z
      .union([z.string(), z.null()])
      .optional()
      .transform((v) => (typeof v === 'string' ? v.trim() : v)),
    applicationGoal: z.number().int().min(MIN_GOAL).max(MAX_GOAL).optional(),
    dashboardView: z.enum(DASHBOARD_VIEWS).optional(),
    defaultAppSort: z.enum(APP_SORTS).optional(),
    defaultAppRange: z.enum(APP_RANGES).optional(),
    defaultAppDir: z.enum(APP_DIRS).optional(),
    hideStatuses: z
      .array(z.enum(APPLICATION_STATUSES as readonly [string, ...string[]]))
      .optional(),
  })
  .strict();

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return apiError('unauthenticated');

  const parsed = await validateBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const updates: Record<string, unknown> = {};

  if ('name' in body && body.name !== undefined) {
    const trimmed = typeof body.name === 'string' ? body.name : '';
    if (trimmed.length > MAX_NAME_LEN) {
      return apiError('invalid_body', {
        message: 'name_too_long',
        details: { hint: `max ${MAX_NAME_LEN} characters` },
      });
    }
    if (trimmed.length > 0 && !NAME_RE.test(trimmed)) {
      return apiError('invalid_body', {
        message: 'invalid_name',
        details: { hint: 'letters and numbers only' },
      });
    }
    updates.name = trimmed.length === 0 ? null : trimmed;
  }
  if (body.applicationGoal !== undefined) updates.applicationGoal = body.applicationGoal;
  if (body.dashboardView !== undefined) updates.dashboardView = body.dashboardView;
  if (body.defaultAppSort !== undefined) updates.defaultAppSort = body.defaultAppSort;
  if (body.defaultAppRange !== undefined) updates.defaultAppRange = body.defaultAppRange;
  if (body.defaultAppDir !== undefined) updates.defaultAppDir = body.defaultAppDir;
  if (body.hideStatuses !== undefined) {
    // Dedupe so the column stays tidy.
    updates.hideStatuses = Array.from(new Set(body.hideStatuses));
  }

  if (Object.keys(updates).length === 0) {
    return apiError('invalid_body', { message: 'nothing_to_update' });
  }

  await db.update(users).set(updates).where(eq(users.id, session.user.id));
  return NextResponse.json({ ok: true, ...updates });
}
