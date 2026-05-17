import { NextResponse } from 'next/server';
import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import {
  backfillQueue,
  classifierUsage,
  emailMessages,
  users,
  userSenderRules,
} from '@kyujin/db/schema';
import {
  classifyLlm,
  getGmailClient,
  getGmailClientById,
  listGmailClients,
  normalizeGmailMessage,
  preClassify,
  upsertApplicationFromClassification,
  type GmailClientHandle,
  type UserSenderRuleSet,
} from '@kyujin/shared';
import { revalidateTag } from 'next/cache';
import { classifierCapForPlan } from '@/lib/plan';

const BATCH_SIZE = 50;

export async function runProcessBatch() {
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
      // Multi-inbox: build a per-connection client cache so we can route each
      // queued item to the inbox it came from. Pre-multi-inbox rows have a
      // null `connectionId` — for those, fall back to all of the user's
      // connections and try them in order until one succeeds.
      const clientById = new Map<string, GmailClientHandle>();
      const fallbackClients: GmailClientHandle[] = [];
      const ensureClient = async (connectionId: string | null) => {
        if (connectionId) {
          let c = clientById.get(connectionId);
          if (!c) {
            c = await getGmailClientById(userId, connectionId);
            clientById.set(connectionId, c);
          }
          return [c];
        }
        if (fallbackClients.length === 0) {
          const all = await listGmailClients(userId);
          if (all.length === 0) {
            // No multi-inbox connections — fall back to the single getter so
            // the error message stays consistent.
            fallbackClients.push(await getGmailClient(userId));
          } else {
            fallbackClients.push(...all);
          }
        }
        return fallbackClients;
      };

      const ruleRows = await db
        .select({ domain: userSenderRules.domain, type: userSenderRules.type })
        .from(userSenderRules)
        .where(eq(userSenderRules.userId, userId));
      const userRules: UserSenderRuleSet = {
        allow: new Set(ruleRows.filter((r) => r.type === 'allow').map((r) => r.domain)),
        block: new Set(ruleRows.filter((r) => r.type === 'block').map((r) => r.domain)),
      };

      // Resolve plan + rolling-30d LLM usage once per user batch. The cap
      // gates the actual generateObject() call; pre-filter/regex hits below
      // still run for free and remain useful when the cap is exhausted (the
      // worker will at least file the email row even if it can't classify).
      const [planRow] = await db
        .select({ plan: users.plan })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const monthlyCap = classifierCapForPlan(planRow?.plan ?? null);
      const usageSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [usageRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(classifierUsage)
        .where(
          and(eq(classifierUsage.userId, userId), gte(classifierUsage.createdAt, usageSince)),
        );
      let usedThisMonth = usageRow?.count ?? 0;
      for (const item of items) {
        try {
          const candidateClients = await ensureClient(item.connectionId ?? null);
          let rawMessage: Parameters<typeof normalizeGmailMessage>[0] | null = null;
          let lastError: unknown = null;
          for (const client of candidateClients) {
            try {
              const fetched = await client.gmail.users.messages.get({
                userId: 'me',
                id: item.gmailMessageId,
                format: 'full',
              });
              rawMessage = fetched.data;
              break;
            } catch (err) {
              lastError = err;
            }
          }
          if (!rawMessage) {
            throw lastError instanceof Error
              ? lastError
              : new Error('failed to fetch message from any inbox');
          }
          const email = normalizeGmailMessage(rawMessage);
          if (!email) {
            await db
              .update(backfillQueue)
              .set({ state: 'done', processedAt: new Date(), lastError: 'unparseable' })
              .where(eq(backfillQueue.id, item.id));
            continue;
          }

          // If this Gmail thread already maps to exactly one application,
          // pre-link the new email so follow-ups the classifier ignores still
          // attach to it. Gmail aggressively groups ATS notifications by
          // sender+subject, so a single thread can carry messages for several
          // roles at the same company — when that happens we leave the link
          // null and let the classifier place it.
          const threadApplicationIds = await db
            .selectDistinct({ applicationId: emailMessages.applicationId })
            .from(emailMessages)
            .where(
              and(
                eq(emailMessages.userId, userId),
                eq(emailMessages.gmailThreadId, email.gmailThreadId),
              ),
            );
          const distinctAppIds = threadApplicationIds
            .map((r) => r.applicationId)
            .filter((id): id is string => !!id);
          const knownApplicationId = distinctAppIds.length === 1 ? distinctAppIds[0] : null;

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
              applicationId: knownApplicationId,
              connectionId: item.connectionId ?? null,
            })
            .onConflictDoUpdate({
              target: [emailMessages.userId, emailMessages.gmailMessageId],
              set: {
                subject: email.subject,
                snippet: email.snippet,
                // Heal legacy rows that pre-date connection tracking. Only
                // overwrite when we know the source inbox; never clear a
                // previously-set connection.
                ...(item.connectionId ? { connectionId: item.connectionId } : {}),
              },
            })
            .returning({ id: emailMessages.id });

          const emailRowId = inserted[0]!.id;

          // Cheap stage first — sender filter, user block/allow rules, and
          // Handshake templates can decide most emails without paying for
          // an LLM call.
          const pre = preClassify(email, userRules);
          let classification = pre;
          if (!classification) {
            // Needs the LLM. Enforce the rolling-30d cap so a widening-
            // window backfill abuser can't keep burning tokens past the
            // plan budget. Cap exceeded → leave the email_messages row in
            // place (so the user still sees it later when their cap
            // resets) and mark the queue item failed with a typed error.
            if (usedThisMonth >= monthlyCap) {
              await db
                .update(backfillQueue)
                .set({
                  state: 'failed',
                  attempts: item.attempts + 1,
                  lastError: `monthly_classifier_cap (${monthlyCap})`,
                })
                .where(eq(backfillQueue.id, item.id));
              continue;
            }
            classification = await classifyLlm(email);
            usedThisMonth++;
            await db.insert(classifierUsage).values({ userId });
          }
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
