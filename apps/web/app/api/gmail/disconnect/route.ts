import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { gmailConnections } from '@kyujin/db/schema';
import { auth } from '@/auth';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // Optional connection id — if provided, disconnect that single inbox.
  // Otherwise disconnect everything for the user (legacy single-inbox behavior).
  let connectionId: string | undefined;
  try {
    const body = (await req.json()) as { connectionId?: string };
    if (typeof body.connectionId === 'string') connectionId = body.connectionId;
  } catch {
    // no body — disconnect all
  }

  if (connectionId) {
    await db
      .delete(gmailConnections)
      .where(
        and(eq(gmailConnections.userId, session.user.id), eq(gmailConnections.id, connectionId)),
      );
  } else {
    await db.delete(gmailConnections).where(eq(gmailConnections.userId, session.user.id));
  }
  return NextResponse.json({ ok: true });
}
