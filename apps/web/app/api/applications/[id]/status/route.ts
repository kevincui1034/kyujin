import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { applicationAudit, applications } from '@kyujin/db/schema';
import { auth } from '@/auth';
import { APPLICATION_STATUSES } from '@kyujin/shared';
import { apiError } from '@/lib/api-errors';
import { validateBody, z } from '@/lib/with-validated-body';
import { enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  status: z.enum(APPLICATION_STATUSES as readonly [string, ...string[]]),
});

// Manual status override. Bypasses the classifier's status precedence so the
// user can downgrade (e.g. demote an over-eager "interview" back to "applied")
// or correct an LLM mistake. Audit-logged so undo works.
// Body: { status: ApplicationStatus }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return apiError('unauthenticated');
  const userId = session.user.id;
  const { id } = await ctx.params;

  const limited = await enforceRateLimit({ userId, key: 'applications:write', window: '1m', max: 60 });
  if (limited) return limited;

  const parsed = await validateBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const status = parsed.data.status as (typeof APPLICATION_STATUSES)[number];

  const [row] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.userId, userId), eq(applications.id, id)))
    .limit(1);
  if (!row) return apiError('not_found');
  if (row.status === status) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  await db
    .update(applications)
    .set({ status, manualOverride: 'status', updatedAt: new Date() })
    .where(and(eq(applications.userId, userId), eq(applications.id, id)));

  await db.insert(applicationAudit).values({
    userId,
    action: 'status_change',
    payload: {
      applicationId: id,
      previousStatus: row.status,
      newStatus: status,
      previousManualOverride: row.manualOverride,
    },
  });

  return NextResponse.json({ ok: true, status });
}
