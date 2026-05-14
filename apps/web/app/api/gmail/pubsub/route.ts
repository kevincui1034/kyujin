import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { backfillQueue, gmailConnections } from '@kyujin/db/schema';
import { getGmailClient } from '@kyujin/shared/gmail';

export const dynamic = 'force-dynamic';

interface PubSubEnvelope {
  message: {
    data: string;
    messageId: string;
    publishTime: string;
  };
  subscription: string;
}

interface GmailNotification {
  emailAddress: string;
  historyId: number;
}

// Gmail Pub/Sub push: receives a base64-encoded JSON payload telling us a
// user has a new historyId. We diff against the stored historyId via
// users.history.list and enqueue any new message IDs.
//
// Note on auth: Vercel handles HTTPS termination but does not natively verify
// the Google-signed JWT in `Authorization: Bearer ...`. For MVP we require a
// shared-secret query param the user adds when configuring the subscription
// in GCP. Production should swap this for proper JWT verification.
export async function POST(req: NextRequest) {
  const expectedToken = process.env.GMAIL_PUBSUB_TOKEN;
  if (expectedToken) {
    const url = new URL(req.url);
    if (url.searchParams.get('token') !== expectedToken) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  const body = (await req.json()) as PubSubEnvelope;
  const decoded = Buffer.from(body.message.data, 'base64').toString('utf-8');
  const notification = JSON.parse(decoded) as GmailNotification;

  const rows = await db
    .select()
    .from(gmailConnections)
    .where(eq(gmailConnections.emailAddress, notification.emailAddress))
    .limit(1);

  const conn = rows[0];
  if (!conn) {
    return NextResponse.json({ skipped: 'unknown email' });
  }

  const { gmail } = await getGmailClient(conn.userId);

  // List history events since stored historyId; enumerate added messages.
  const startHistoryId = conn.historyId ? String(conn.historyId) : String(notification.historyId);
  let enqueued = 0;
  let pageToken: string | undefined;
  do {
    const res = await gmail.users.history.list({
      userId: 'me',
      startHistoryId,
      historyTypes: ['messageAdded'],
      labelId: 'INBOX',
      pageToken,
    });
    for (const h of res.data.history ?? []) {
      for (const m of h.messagesAdded ?? []) {
        if (!m.message?.id) continue;
        await db
          .insert(backfillQueue)
          .values({ userId: conn.userId, gmailMessageId: m.message.id })
          .onConflictDoNothing();
        enqueued++;
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  // Bump stored historyId so we don't replay. Only advance forward — the
  // pubsub stream can briefly deliver out-of-order events.
  const incoming = BigInt(notification.historyId);
  if (!conn.historyId || incoming > conn.historyId) {
    await db
      .update(gmailConnections)
      .set({ historyId: incoming, updatedAt: new Date() })
      .where(eq(gmailConnections.id, conn.id));
  }

  return NextResponse.json({ enqueued });
}
