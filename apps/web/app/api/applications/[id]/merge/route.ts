import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { applicationAudit, applications, emailMessages } from '@kyujin/db/schema';
import { auth } from '@/auth';
import { buildMatchKey } from '@kyujin/shared';
import { apiError } from '@/lib/api-errors';
import { validateBody, z } from '@/lib/with-validated-body';
import { enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  intoId: z.string().uuid(),
});

// Manually merge this application's emails INTO another application owned by
// the same user, then delete this application. Writes an audit entry that
// captures enough state to reverse the merge (source snapshot, the target's
// pre-merge fields, and the list of moved email IDs).
// Body: { intoId: string }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return apiError('unauthenticated');
  const userId = session.user.id;
  const { id } = await ctx.params;

  const limited = await enforceRateLimit({ userId, key: 'applications:write', window: '1m', max: 60 });
  if (limited) return limited;

  const parsed = await validateBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { intoId } = parsed.data;

  if (intoId === id) {
    return apiError('invalid_body', { message: 'cannot merge into self' });
  }

  const rows = await db.select().from(applications).where(eq(applications.userId, userId));
  const source = rows.find((r) => r.id === id);
  const target = rows.find((r) => r.id === intoId);
  if (!source) return apiError('not_found', { message: 'source_not_found' });
  if (!target) return apiError('not_found', { message: 'target_not_found' });

  // Capture pre-merge snapshots before we touch anything. The full source
  // row goes into the audit so undo can re-insert it; the target's status,
  // first_seen_at, last_event_at and match_key are saved so undo can roll
  // those back too.
  const sourceEmails = await db
    .select({ id: emailMessages.id })
    .from(emailMessages)
    .where(and(eq(emailMessages.userId, userId), eq(emailMessages.applicationId, source.id)));
  const movedEmailIds = sourceEmails.map((e) => e.id);

  const PRECEDENCE: Record<string, number> = {
    applied: 0,
    no_response: 1,
    interview: 2,
    rejected: 3,
    accepted: 4,
    obtained: 5,
  };
  const finalStatus =
    PRECEDENCE[source.status]! > PRECEDENCE[target.status]! ? source.status : target.status;
  const lastEventAt =
    source.lastEventAt > target.lastEventAt ? source.lastEventAt : target.lastEventAt;
  const firstSeenAt =
    source.firstSeenAt < target.firstSeenAt ? source.firstSeenAt : target.firstSeenAt;

  // 1. Clear source.match_key so the (user, match_key) UNIQUE constraint
  //    doesn't fight the upcoming re-pointing/delete sequence.
  await db
    .update(applications)
    .set({ matchKey: null, updatedAt: new Date() })
    .where(and(eq(applications.userId, userId), eq(applications.id, source.id)));

  // 2. Re-point emails.
  if (movedEmailIds.length > 0) {
    await db
      .update(emailMessages)
      .set({ applicationId: target.id })
      .where(and(eq(emailMessages.userId, userId), eq(emailMessages.applicationId, source.id)));
  }

  // 3. Update target's aggregate fields.
  await db
    .update(applications)
    .set({
      status: finalStatus,
      lastEventAt,
      firstSeenAt,
      matchKey: target.matchKey ?? buildMatchKey(target.company, target.role),
      updatedAt: new Date(),
    })
    .where(and(eq(applications.userId, userId), eq(applications.id, target.id)));

  // 4. Delete the source row.
  await db
    .delete(applications)
    .where(and(eq(applications.userId, userId), eq(applications.id, source.id)));

  // 5. Write audit entry.
  await db.insert(applicationAudit).values({
    userId,
    action: 'merge',
    payload: {
      sourceSnapshot: {
        id: source.id,
        company: source.company,
        role: source.role,
        sourceDomain: source.sourceDomain,
        status: source.status,
        firstSeenAt: source.firstSeenAt.toISOString(),
        lastEventAt: source.lastEventAt.toISOString(),
        ghostedAt: source.ghostedAt?.toISOString() ?? null,
        manualOverride: source.manualOverride,
        notes: source.notes,
        matchKey: source.matchKey,
      },
      targetSnapshot: {
        id: target.id,
        status: target.status,
        firstSeenAt: target.firstSeenAt.toISOString(),
        lastEventAt: target.lastEventAt.toISOString(),
        matchKey: target.matchKey,
      },
      movedEmailIds,
    },
  });

  return NextResponse.json({ ok: true, mergedInto: target.id });
}
