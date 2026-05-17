import { NextResponse } from 'next/server';
import { lt, eq, or, isNull } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { gmailConnections } from '@kyujin/db/schema';
import { getGmailClientById } from '@kyujin/shared/gmail';

// Gmail watches expire after 7 days; refresh anything within 24h of expiry.
const ROLLING_HOURS = 24;

export async function runRefreshWatches() {
  const topic = process.env.GMAIL_PUBSUB_TOPIC;
  if (!topic) {
    return NextResponse.json({ skipped: 'no topic configured' });
  }

  const cutoff = new Date(Date.now() + ROLLING_HOURS * 3600 * 1000);
  const expiring = await db
    .select()
    .from(gmailConnections)
    .where(or(isNull(gmailConnections.watchExpiration), lt(gmailConnections.watchExpiration, cutoff)));

  let refreshed = 0;
  for (const conn of expiring) {
    try {
      const { gmail } = await getGmailClientById(conn.userId, conn.id);
      const res = await gmail.users.watch({
        userId: 'me',
        requestBody: { topicName: topic, labelIds: ['INBOX'] },
      });
      await db
        .update(gmailConnections)
        .set({
          historyId: res.data.historyId ? BigInt(res.data.historyId) : null,
          watchExpiration: res.data.expiration ? new Date(Number(res.data.expiration)) : null,
          updatedAt: new Date(),
        })
        .where(eq(gmailConnections.id, conn.id));
      refreshed++;
    } catch {
      // Don't fail the cron over one bad connection
    }
  }

  return NextResponse.json({ checked: expiring.length, refreshed });
}
