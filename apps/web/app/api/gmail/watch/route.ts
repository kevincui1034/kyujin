import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { gmailConnections } from '@kyujin/db/schema';
import { auth } from '@/auth';
import { getGmailClient } from '@kyujin/shared/gmail';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const topic = process.env.GMAIL_PUBSUB_TOPIC;
  if (!topic) {
    return NextResponse.json(
      { error: 'GMAIL_PUBSUB_TOPIC not configured. Set up a Pub/Sub topic in GCP first.' },
      { status: 503 },
    );
  }

  const { gmail, connectionId } = await getGmailClient(session.user.id);
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
    .where(eq(gmailConnections.id, connectionId));

  return NextResponse.json({ historyId: res.data.historyId, expiration: res.data.expiration });
}
