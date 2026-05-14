import { NextResponse, type NextRequest } from 'next/server';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { backfillQueue, emailMessages } from '@kyujin/db/schema';
import {
  classify,
  getGmailClient,
  normalizeGmailMessage,
  upsertApplicationFromClassification,
} from '@kyujin/shared';
import { revalidateTag } from 'next/cache';
import { isAuthorizedCron } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BATCH_SIZE = 50;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return process();
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return process();
}

async function process() {
  const started = Date.now();
  // Pull a batch of pending items. Worth noting: this doesn't lock rows, so two
  // concurrent crons could pick the same row. For MVP we accept that — the
  // unique constraint on (user_id, gmail_message_id) in email_messages will
  // dedupe writes, and we mark items `done` before classifying.
  const queued = await db
    .select()
    .from(backfillQueue)
    .where(eq(backfillQueue.state, 'pending'))
    .orderBy(asc(backfillQueue.enqueuedAt))
    .limit(BATCH_SIZE);

  if (queued.length === 0) {
    return NextResponse.json({ processed: 0, durationMs: Date.now() - started });
  }

  // Claim the rows
  await db
    .update(backfillQueue)
    .set({ state: 'processing' })
    .where(
      inArray(
        backfillQueue.id,
        queued.map((q) => q.id),
      ),
    );

  // Group by user to amortize the Gmail client creation
  const byUser = new Map<string, typeof queued>();
  for (const q of queued) {
    const arr = byUser.get(q.userId) ?? [];
    arr.push(q);
    byUser.set(q.userId, arr);
  }

  const touchedUsers = new Set<string>();
  let processed = 0;
  let failed = 0;

  for (const [userId, items] of byUser) {
    try {
      const { gmail } = await getGmailClient(userId);
      for (const item of items) {
        try {
          const res = await gmail.users.messages.get({
            userId: 'me',
            id: item.gmailMessageId,
            format: 'full',
          });
          const email = normalizeGmailMessage(res.data);
          if (!email) {
            await db
              .update(backfillQueue)
              .set({ state: 'done', processedAt: new Date(), lastError: 'unparseable' })
              .where(eq(backfillQueue.id, item.id));
            continue;
          }

          // Persist the email row (upsert by user+gmailMessageId)
          const inserted = await db
            .insert(emailMessages)
            .values({
              userId,
              gmailMessageId: email.gmailMessageId,
              gmailThreadId: email.gmailThreadId,
              fromAddress: email.fromAddress,
              fromDomain: email.fromDomain,
              subject: email.subject,
              snippet: email.snippet,
              receivedAt: email.receivedAt,
            })
            .onConflictDoUpdate({
              target: [emailMessages.userId, emailMessages.gmailMessageId],
              set: { subject: email.subject, snippet: email.snippet },
            })
            .returning({ id: emailMessages.id });

          const emailRowId = inserted[0]!.id;

          const classification = await classify(email);
          await upsertApplicationFromClassification({
            userId,
            email,
            emailMessageRowId: emailRowId,
            classification,
          });

          await db
            .update(backfillQueue)
            .set({ state: 'done', processedAt: new Date() })
            .where(eq(backfillQueue.id, item.id));

          touchedUsers.add(userId);
          processed++;
        } catch (err) {
          failed++;
          await db
            .update(backfillQueue)
            .set({
              state: 'failed',
              attempts: item.attempts + 1,
              lastError: err instanceof Error ? err.message.slice(0, 500) : String(err),
            })
            .where(eq(backfillQueue.id, item.id));
        }
      }
    } catch (err) {
      // User-level failure (e.g. Gmail tokens unrecoverable). Mark all items pending again with attempts++.
      failed += items.length;
      await db
        .update(backfillQueue)
        .set({
          state: 'pending',
          lastError: err instanceof Error ? err.message.slice(0, 500) : String(err),
        })
        .where(
          and(
            inArray(
              backfillQueue.id,
              items.map((i) => i.id),
            ),
            eq(backfillQueue.state, 'processing'),
          ),
        );
    }
  }

  // Cache invalidation for each user whose applications changed
  for (const userId of touchedUsers) {
    revalidateTag(`user:${userId}:applications`);
  }

  return NextResponse.json({
    processed,
    failed,
    users: byUser.size,
    durationMs: Date.now() - started,
  });
}
