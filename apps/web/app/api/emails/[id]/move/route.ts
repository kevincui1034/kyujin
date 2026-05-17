import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { applications, applicationAudit, emailMessages } from '@kyujin/db/schema';
import { auth } from '@/auth';
import { apiError } from '@/lib/api-errors';
import { validateBody, z } from '@/lib/with-validated-body';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  applicationId: z.string().uuid().nullable(),
  allInThread: z.boolean().optional().default(false),
});

// Move a single email (or every email in its Gmail thread) between
// applications, or detach. Logs an undoable audit entry.
// Body: { applicationId: string | null, allInThread?: boolean }
//   applicationId: target app, or null to detach
//   allInThread:   when true, also move every other email in the same Gmail
//                  thread that currently points at the SAME source application.
//                  (Thread emails pointing elsewhere are left alone so we
//                  don't trample on unrelated history.)
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return apiError('unauthenticated');
  const userId = session.user.id;
  const { id } = await ctx.params;

  const parsed = await validateBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { applicationId, allInThread } = parsed.data;

  // Pull the email row so we know its thread and previous application.
  const [email] = await db
    .select({
      id: emailMessages.id,
      gmailThreadId: emailMessages.gmailThreadId,
      applicationId: emailMessages.applicationId,
    })
    .from(emailMessages)
    .where(and(eq(emailMessages.userId, userId), eq(emailMessages.id, id)))
    .limit(1);
  if (!email) return apiError('not_found', { message: 'email_not_found' });

  if (applicationId !== null) {
    const [target] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.userId, userId), eq(applications.id, applicationId)))
      .limit(1);
    if (!target) {
      return apiError('not_found', { message: 'target_application_not_found' });
    }
  }

  // Collect the set of emails we're about to move: the target row, plus
  // every sibling in the same thread pointing at the same source app when
  // `allInThread` is set. We capture each row's previous applicationId so
  // the audit log can reverse the move precisely.
  const candidateRows = allInThread
    ? await db
        .select({
          id: emailMessages.id,
          applicationId: emailMessages.applicationId,
        })
        .from(emailMessages)
        .where(
          and(
            eq(emailMessages.userId, userId),
            eq(emailMessages.gmailThreadId, email.gmailThreadId),
            // Only pull siblings still attached to the same source — leave
            // any thread-member already pointing elsewhere alone.
            email.applicationId === null
              ? eq(emailMessages.id, email.id) // detach case w/ allInThread: only this one
              : eq(emailMessages.applicationId, email.applicationId),
          ),
        )
    : [{ id: email.id, applicationId: email.applicationId }];

  // Apply the move row-by-row so the audit payload can reverse each entry.
  const moved: Array<{ emailId: string; previousApplicationId: string | null }> = [];
  for (const r of candidateRows) {
    await db
      .update(emailMessages)
      .set({ applicationId })
      .where(and(eq(emailMessages.userId, userId), eq(emailMessages.id, r.id)));
    moved.push({ emailId: r.id, previousApplicationId: r.applicationId });
  }

  await db.insert(applicationAudit).values({
    userId,
    action: applicationId === null ? 'detach_email' : 'move_email',
    payload: {
      moved,
      newApplicationId: applicationId,
      allInThread,
      gmailThreadId: email.gmailThreadId,
    },
  });

  return NextResponse.json({ ok: true, applicationId, movedCount: moved.length });
}
