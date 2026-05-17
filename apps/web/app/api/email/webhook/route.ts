import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { backfillQueue, nylasConnections } from '@kyujin/db/schema';
import {
  verifyWebhookSignature,
  type NylasWebhookEvent,
} from '@kyujin/shared/nylas';

export const runtime = 'nodejs';

// Nylas webhook endpoint. Two responsibilities:
//
// 1) Challenge handshake on webhook creation — Nylas sends a request with
//    ?challenge=<random> and expects the body to be exactly that value as
//    plain text. v3 uses GET; we accept it on POST too defensively.
// 2) Live event delivery — POST with signed JSON body. We verify HMAC, then
//    branch on event type:
//       message.created  → enqueue into backfill_queue for the cron worker
//       grant.expired    → flag the connection as needsReauth
//       grant.deleted    → same as expired

function challengeResponse(challenge: string) {
  // Nylas requires non-chunked transfer encoding for verification. An explicit
  // Content-Length forces a fixed-length response and bypasses Next.js's
  // default chunked streaming for string bodies.
  const body = Buffer.from(challenge, 'utf-8');
  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'content-length': String(body.byteLength),
    },
  });
}

export async function GET(request: NextRequest) {
  const challenge = request.nextUrl.searchParams.get('challenge');
  if (!challenge) return new NextResponse('missing challenge', { status: 400 });
  return challengeResponse(challenge);
}

export async function POST(request: NextRequest) {
  // Some setups still see POST-style challenges. Honor both.
  const queryChallenge = request.nextUrl.searchParams.get('challenge');
  if (queryChallenge) return challengeResponse(queryChallenge);

  const rawBody = await request.text();
  const signature = request.headers.get('x-nylas-signature');
  if (!verifyWebhookSignature(rawBody, signature)) {
    return new NextResponse('invalid signature', { status: 401 });
  }

  let event: NylasWebhookEvent;
  try {
    event = JSON.parse(rawBody) as NylasWebhookEvent;
  } catch {
    return new NextResponse('invalid json', { status: 400 });
  }

  const grantId = event.data?.object?.grantId;
  if (!grantId) {
    // Nylas pings other event shapes occasionally (e.g. account-level events
    // without a grant). 200 so Nylas doesn't retry; nothing to do.
    return NextResponse.json({ skipped: 'no grant_id' });
  }

  const [connection] = await db
    .select()
    .from(nylasConnections)
    .where(eq(nylasConnections.grantId, grantId))
    .limit(1);
  if (!connection) {
    return NextResponse.json({ skipped: 'unknown grant' });
  }

  switch (event.type) {
    case 'message.created': {
      const messageId = event.data.object.id;
      if (!messageId) return NextResponse.json({ skipped: 'no message id' });
      // connectionId left null: backfill_queue.connection_id FKs to
      // gmail_connections.id (legacy schema). The worker resolves the
      // Nylas connection via userId + EMAIL_PROVIDER=nylas instead.
      await db
        .insert(backfillQueue)
        .values({
          userId: connection.userId,
          gmailMessageId: messageId,
        })
        .onConflictDoNothing();
      return NextResponse.json({ enqueued: messageId });
    }

    case 'grant.expired':
    case 'grant.deleted': {
      await db
        .update(nylasConnections)
        .set({ needsReauth: true, updatedAt: new Date() })
        .where(eq(nylasConnections.id, connection.id));
      return NextResponse.json({ flagged: 'needsReauth' });
    }

    default: {
      // Unhandled event types are 200'd so Nylas doesn't burn retries.
      // If you enable a new trigger in the dashboard, add a case here.
      return NextResponse.json({ skipped: event.type });
    }
  }
}
