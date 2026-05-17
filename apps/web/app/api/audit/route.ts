import { NextResponse, type NextRequest } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { applicationAudit } from '@kyujin/db/schema';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

// Most-recent first list of audit entries for the signed-in user. Capped at
// 100 — the audit page is a chronological view, not a search interface.
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const rows = await db
    .select()
    .from(applicationAudit)
    .where(eq(applicationAudit.userId, session.user.id))
    .orderBy(desc(applicationAudit.createdAt))
    .limit(100);
  return NextResponse.json({ entries: rows });
}
