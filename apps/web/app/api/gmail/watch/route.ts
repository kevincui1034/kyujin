import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { gmailConnections } from '@kyujin/db/schema';
import { auth } from '@/auth';
import { getGmailClientById, listGmailClients } from '@kyujin/shared/gmail';

export async function POST(req: NextRequest) {
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

  // Body is optional: when omitted, start a watch on every connection the user has.
  // When `connectionId` is provided, target that specific inbox.
  let connectionId: string | undefined;
  try {
    const body = (await req.json()) as { connectionId?: string };
    if (typeof body.connectionId === 'string') connectionId = body.connectionId;
  } catch {
    // no body
  }

  if (connectionId) {
    const [conn] = await db
      .select({ id: gmailConnections.id })
      .from(gmailConnections)
      .where(
        and(eq(gmailConnections.userId, session.user.id), eq(gmailConnections.id, connectionId)),
      )
      .limit(1);
    if (!conn) return NextResponse.json({ error: 'connection_not_found' }, { status: 404 });

    const { gmail } = await getGmailClientById(session.user.id, conn.id);
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

    return NextResponse.json({ historyId: res.data.historyId, expiration: res.data.expiration });
  }

  // No id supplied — start watches on every connection.
  const clients = await listGmailClients(session.user.id);
  if (clients.length === 0) {
    return NextResponse.json({ error: 'no_gmail_connection' }, { status: 400 });
  }

  const results: { emailAddress: string; expiration: string | null }[] = [];
  for (const client of clients) {
    try {
      const res = await client.gmail.users.watch({
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
        .where(eq(gmailConnections.id, client.connectionId));
      results.push({
        emailAddress: client.emailAddress,
        expiration: res.data.expiration ?? null,
      });
    } catch {
      results.push({ emailAddress: client.emailAddress, expiration: null });
    }
  }

  return NextResponse.json({ watches: results });
}
