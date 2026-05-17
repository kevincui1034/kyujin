import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { applicationAudit, applications } from '@kyujin/db/schema';
import { auth } from '@/auth';
import { APPLICATION_STATUSES, type ApplicationStatus } from '@kyujin/shared';

export const dynamic = 'force-dynamic';

function isStatus(v: unknown): v is ApplicationStatus {
  return typeof v === 'string' && (APPLICATION_STATUSES as readonly string[]).includes(v);
}

// Manual status override. Bypasses the classifier's status precedence so the
// user can downgrade (e.g. demote an over-eager "interview" back to "applied")
// or correct an LLM mistake. Audit-logged so undo works.
// Body: { status: ApplicationStatus }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await ctx.params;

  let status: ApplicationStatus;
  try {
    const body = (await req.json()) as { status?: unknown };
    if (!isStatus(body.status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }
    status = body.status;
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const [row] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.userId, userId), eq(applications.id, id)))
    .limit(1);
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
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
