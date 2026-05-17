// One-off backfill driver for a single user. Bypasses the cookie-authed
// /api/gmail/backfill route by talking to the same DB / Gmail / classifier
// pieces directly. Use when you want to comp a user a backfill outside
// the normal product flow.
//
// Usage:
//   set -a && source apps/web/.env.local && set +a
//   pnpm --filter @kyujin/web exec tsx scripts/backfill-user.ts <email> [days=365] [cap=3000]

import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import {
  backfillQueue,
  classifierUsage,
  emailMessages,
  userSenderRules,
  users,
} from '@kyujin/db/schema';
import {
  buildBackfillQuery,
  classifyLlm,
  getGmailClientById,
  listGmailClients,
  listJobMessageIds,
  normalizeGmailMessage,
  preClassify,
  upsertApplicationFromClassification,
  type GmailClientHandle,
  type UserSenderRuleSet,
} from '@kyujin/shared';

const ARG_EMAIL = process.argv[2];
const DAYS = parseInt(process.argv[3] ?? '365', 10);
const CAP = parseInt(process.argv[4] ?? '3000', 10);
const BATCH_SIZE = 50;
const MAX_ITERATIONS = 500;

if (!ARG_EMAIL) {
  console.error(
    'usage: tsx scripts/backfill-user.ts <email> [days=365] [cap=3000]',
  );
  process.exit(1);
}
const EMAIL: string = ARG_EMAIL;

async function main() {
  const [u] = await db
    .select({ id: users.id, plan: users.plan })
    .from(users)
    .where(eq(users.email, EMAIL))
    .limit(1);
  if (!u) throw new Error(`user not found: ${EMAIL}`);
  const userId = u.id;
  console.log(`User: ${EMAIL}  id=${userId}  plan=${u.plan}`);

  const clients = await listGmailClients(userId);
  if (clients.length === 0) {
    throw new Error('user has no gmail_connections');
  }
  console.log(`Gmail inboxes: ${clients.map((c) => c.emailAddress).join(', ')}`);

  // ─── 1. Enqueue ───
  const query = buildBackfillQuery(DAYS);
  console.log(`\nQuery (${DAYS}d, cap=${CAP}): ${query}\n`);

  let totalFound = 0;
  let totalEnqueued = 0;
  for (const client of clients) {
    process.stdout.write(`Listing ${client.emailAddress}... `);
    const ids = await listJobMessageIds(client.gmail, query, CAP);
    console.log(`${ids.length} matched`);
    totalFound += ids.length;
    if (ids.length === 0) continue;

    const rows = ids.map((gmailMessageId) => ({
      userId,
      gmailMessageId,
      connectionId: client.connectionId,
    }));
    let inboxEnqueued = 0;
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const inserted = await db
        .insert(backfillQueue)
        .values(rows.slice(i, i + CHUNK))
        .onConflictDoNothing()
        .returning({ id: backfillQueue.id });
      inboxEnqueued += inserted.length;
    }
    console.log(`  → ${inboxEnqueued} new (rest already queued)`);
    totalEnqueued += inboxEnqueued;
  }
  console.log(
    `\nEnqueue complete: ${totalEnqueued} new of ${totalFound} found.\n`,
  );

  // ─── 2. Drain (inlines lib/process-batch.ts, scoped to this user) ───
  const ruleRows = await db
    .select({ domain: userSenderRules.domain, type: userSenderRules.type })
    .from(userSenderRules)
    .where(eq(userSenderRules.userId, userId));
  const userRules: UserSenderRuleSet = {
    allow: new Set(ruleRows.filter((r) => r.type === 'allow').map((r) => r.domain)),
    block: new Set(ruleRows.filter((r) => r.type === 'block').map((r) => r.domain)),
  };

  // 15_000 = premium 30-day classifier cap from lib/plans.ts. We're well
  // under that with a 3k backfill cap and pre-filtering, so the gate is
  // mostly a safety belt.
  const monthlyCap = 15_000;
  const usageSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [usageRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(classifierUsage)
    .where(
      and(eq(classifierUsage.userId, userId), gte(classifierUsage.createdAt, usageSince)),
    );
  let usedThisMonth = usageRow?.count ?? 0;

  const clientById = new Map<string, GmailClientHandle>();
  const fallbackClients: GmailClientHandle[] = clients;

  const fetchEmail = async (item: {
    id: string;
    gmailMessageId: string;
    connectionId: string | null;
  }) => {
    let candidateClients: GmailClientHandle[];
    if (item.connectionId) {
      let c = clientById.get(item.connectionId);
      if (!c) {
        c = await getGmailClientById(userId, item.connectionId);
        clientById.set(item.connectionId, c);
      }
      candidateClients = [c];
    } else {
      candidateClients = fallbackClients;
    }
    let lastError: unknown = null;
    for (const client of candidateClients) {
      try {
        const fetched = await client.gmail.users.messages.get({
          userId: 'me',
          id: item.gmailMessageId,
          format: 'full',
        });
        return normalizeGmailMessage(fetched.data);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('failed to fetch message from any inbox');
  };

  let iteration = 0;
  let cumulativeProcessed = 0;
  let cumulativeFailed = 0;

  console.log(`--- Draining queue ---`);
  while (iteration < MAX_ITERATIONS) {
    iteration++;
    const queued = await db
      .select()
      .from(backfillQueue)
      .where(and(eq(backfillQueue.state, 'pending'), eq(backfillQueue.userId, userId)))
      .orderBy(asc(backfillQueue.enqueuedAt))
      .limit(BATCH_SIZE);

    if (queued.length === 0) {
      console.log(
        `\nIteration ${iteration}: queue empty. Done.`,
      );
      break;
    }

    await db
      .update(backfillQueue)
      .set({ state: 'processing' })
      .where(inArray(backfillQueue.id, queued.map((q) => q.id)));

    let batchProcessed = 0;
    let batchFailed = 0;
    let batchClassified = 0;

    for (const item of queued) {
      try {
        const email = await fetchEmail({
          id: item.id,
          gmailMessageId: item.gmailMessageId,
          connectionId: item.connectionId,
        });
        if (!email) {
          await db
            .update(backfillQueue)
            .set({ state: 'done', processedAt: new Date(), lastError: 'unparseable' })
            .where(eq(backfillQueue.id, item.id));
          continue;
        }

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
              ...(item.connectionId ? { connectionId: item.connectionId } : {}),
            },
          })
          .returning({ id: emailMessages.id });

        const emailRowId = inserted[0]!.id;

        const pre = preClassify(email, userRules);
        let classification = pre;
        if (!classification) {
          if (usedThisMonth >= monthlyCap) {
            await db
              .update(backfillQueue)
              .set({
                state: 'failed',
                attempts: item.attempts + 1,
                lastError: `monthly_classifier_cap (${monthlyCap})`,
              })
              .where(eq(backfillQueue.id, item.id));
            batchFailed++;
            continue;
          }
          classification = await classifyLlm(email);
          usedThisMonth++;
          batchClassified++;
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
        batchProcessed++;
      } catch (err) {
        batchFailed++;
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

    cumulativeProcessed += batchProcessed;
    cumulativeFailed += batchFailed;
    console.log(
      `[${iteration}] batch=${queued.length} ok=${batchProcessed} fail=${batchFailed} llm=${batchClassified} (cum ok=${cumulativeProcessed}, fail=${cumulativeFailed})`,
    );
  }

  console.log(
    `\nFinal: processed ${cumulativeProcessed}, failed ${cumulativeFailed} across ${iteration} iterations.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
