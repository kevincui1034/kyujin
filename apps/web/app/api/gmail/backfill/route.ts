import { NextResponse } from 'next/server';
import { db } from '@kyujin/db/client';
import { backfillQueue } from '@kyujin/db/schema';
import { auth } from '@/auth';
import { BACKFILL_QUERY, getGmailClient, listJobMessageIds } from '@kyujin/shared/gmail';

export const maxDuration = 60;

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { gmail } = await getGmailClient(session.user.id);
  const ids = await listJobMessageIds(gmail, BACKFILL_QUERY, 500);

  if (ids.length === 0) {
    return NextResponse.json({ enqueued: 0 });
  }

  const rows = ids.map((gmailMessageId) => ({
    userId: session.user!.id,
    gmailMessageId,
  }));

  // Chunk inserts to keep the query reasonable
  const CHUNK = 100;
  let enqueued = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const inserted = await db
      .insert(backfillQueue)
      .values(slice)
      .onConflictDoNothing()
      .returning({ id: backfillQueue.id });
    enqueued += inserted.length;
  }

  return NextResponse.json({ enqueued, found: ids.length });
}
