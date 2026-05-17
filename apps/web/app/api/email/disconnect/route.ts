import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { nylasConnections } from '@kyujin/db/schema';
import { revokeGrant } from '@kyujin/shared/nylas';
import { auth } from '@/auth';

// Nylas equivalent of /api/gmail/disconnect. Revokes the grant on Nylas's
// side (which propagates to Google) and deletes the local connection row(s).
// Optional `connectionId` in the body — when present, disconnects that single
// inbox; otherwise disconnects everything for the user.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let connectionId: string | undefined;
  try {
    const body = (await req.json()) as { connectionId?: string };
    if (typeof body.connectionId === 'string') connectionId = body.connectionId;
  } catch {
    // no body — disconnect all
  }

  const rowsToDelete = connectionId
    ? await db
        .select({ id: nylasConnections.id, grantId: nylasConnections.grantId })
        .from(nylasConnections)
        .where(
          and(eq(nylasConnections.userId, session.user.id), eq(nylasConnections.id, connectionId)),
        )
    : await db
        .select({ id: nylasConnections.id, grantId: nylasConnections.grantId })
        .from(nylasConnections)
        .where(eq(nylasConnections.userId, session.user.id));

  // Revoke first, then delete locally. If Nylas is unreachable we still want
  // the local row gone so the user can reconnect cleanly — but log so we
  // notice if grants leak server-side.
  for (const row of rowsToDelete) {
    try {
      await revokeGrant(row.grantId);
    } catch (err) {
      console.error('[email/disconnect] revokeGrant failed', { grantId: row.grantId, err });
    }
  }

  if (connectionId) {
    await db
      .delete(nylasConnections)
      .where(
        and(eq(nylasConnections.userId, session.user.id), eq(nylasConnections.id, connectionId)),
      );
  } else {
    await db.delete(nylasConnections).where(eq(nylasConnections.userId, session.user.id));
  }

  return NextResponse.json({ ok: true, revoked: rowsToDelete.length });
}
