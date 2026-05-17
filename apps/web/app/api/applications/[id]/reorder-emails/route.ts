import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { applicationAudit, emailMessages } from '@kyujin/db/schema';
import { auth } from '@/auth';
import { apiError } from '@/lib/api-errors';
import { validateBody, z } from '@/lib/with-validated-body';

export const dynamic = 'force-dynamic';

// Cap matches the practical max number of emails attached to a single
// application's timeline. Far above any real run; protects against a
// pathological client sending an unbounded array.
const REORDER_MAX = 500;

const bodySchema = z.object({
  orderedEmailIds: z.array(z.string().uuid()).max(REORDER_MAX),
});

// Reorder the timeline emails of a single application. Body provides the
// full ordered list of email IDs the user wants displayed top-to-bottom.
// We stamp display_order = 0..N onto each one and capture the previous
// values for undo.
// Body: { orderedEmailIds: string[] }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return apiError('unauthenticated');
  const userId = session.user.id;
  const { id: applicationId } = await ctx.params;

  const parsed = await validateBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { orderedEmailIds } = parsed.data;

  if (orderedEmailIds.length === 0) {
    return NextResponse.json({ ok: true, count: 0 });
  }

  // Validate: every supplied email belongs to this user AND is currently
  // attached to this application. Drag-reorder can only shuffle WITHIN one
  // application's timeline — moving across apps goes through /api/emails/[id]/move.
  const owned = await db
    .select({
      id: emailMessages.id,
      displayOrder: emailMessages.displayOrder,
      applicationId: emailMessages.applicationId,
    })
    .from(emailMessages)
    .where(
      and(eq(emailMessages.userId, userId), inArray(emailMessages.id, orderedEmailIds)),
    );

  if (owned.length !== orderedEmailIds.length) {
    return apiError('not_found', { message: 'one or more emails not found' });
  }
  for (const e of owned) {
    if (e.applicationId !== applicationId) {
      return apiError('invalid_body', {
        message: 'email not attached to this application',
        details: { emailId: e.id },
      });
    }
  }

  // Snapshot previous orders before the update so undo can restore them.
  const previousMap = new Map(owned.map((e) => [e.id, e.displayOrder]));

  // Stamp the new positions. Each row is its own UPDATE — small N (≤ ~50 in
  // practice for a single app), so a loop is fine and keeps the SQL trivial.
  for (let i = 0; i < orderedEmailIds.length; i++) {
    const emailId = orderedEmailIds[i]!;
    await db
      .update(emailMessages)
      .set({ displayOrder: i })
      .where(and(eq(emailMessages.userId, userId), eq(emailMessages.id, emailId)));
  }

  await db.insert(applicationAudit).values({
    userId,
    action: 'reorder_emails',
    payload: {
      applicationId,
      previousOrders: orderedEmailIds.map((emailId) => ({
        emailId,
        previousDisplayOrder: previousMap.get(emailId) ?? null,
      })),
      newOrderedEmailIds: orderedEmailIds,
    },
  });

  return NextResponse.json({ ok: true, count: orderedEmailIds.length });
}
