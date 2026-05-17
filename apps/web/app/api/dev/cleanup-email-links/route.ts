import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, isNotNull, notInArray, sql } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { classifications, emailMessages } from '@kyujin/db/schema';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

// Dev-only: null out `applicationId` on emails that were pre-linked by the
// cron's thread-based heuristic but never actually classified into that app
// (i.e. no row in the `classifications` table). Those pre-fills can be wrong
// when Gmail threads multiple applications together, and they cause
// cross-role bleed in the application detail timeline.
//
// Returns 404 in production.
export async function POST(_req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const userId = session.user.id;

  const classifiedIds = db
    .select({ id: classifications.emailMessageId })
    .from(classifications);

  const updated = await db
    .update(emailMessages)
    .set({ applicationId: null })
    .where(
      and(
        eq(emailMessages.userId, userId),
        isNotNull(emailMessages.applicationId),
        notInArray(emailMessages.id, classifiedIds),
      ),
    )
    .returning({ id: emailMessages.id });

  return NextResponse.json({ cleared: updated.length });
}

// GET shows a count without making changes — handy for previewing the impact.
export async function GET(_req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const userId = session.user.id;

  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.userId, userId),
        isNotNull(emailMessages.applicationId),
        notInArray(
          emailMessages.id,
          db.select({ id: classifications.emailMessageId }).from(classifications),
        ),
      ),
    );

  return NextResponse.json({ wouldClear: Number(rows[0]?.count ?? 0) });
}
