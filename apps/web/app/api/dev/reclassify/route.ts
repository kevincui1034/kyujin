import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ilike, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { applications, emailMessages, userSenderRules } from '@kyujin/db/schema';
import {
  classify,
  hasJobApplicationSubjectMarker,
  isAtsVendorName,
  listGmailClients,
  looksLikeCareerSender,
  normalizeGmailMessage,
  upsertApplicationFromClassification,
  type GmailClientHandle,
  type UserSenderRuleSet,
} from '@kyujin/shared';
import { revalidateTag } from 'next/cache';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// One-shot dev endpoint: re-runs classification on every email the user has
// previously fetched. Use after changing classifier logic (e.g. dropping the
// regex/cache shortcuts) to backfill correct labels + company/role. After the
// pass, deletes auto-created application rows whose emails all moved away.
//
// Returns 404 in production so it can't be probed.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const userId = session.user.id;
  const started = Date.now();
  // Modes:
  //   targeted    — only emails attached to apps whose company looks like an
  //                 ATS vendor name (the workday/greenhouse-mail/"Workday@Cisco"
  //                 case). Smallest batch, most surgical.
  //   needs-fix   — vendor-name OR role IS NULL. Catches stale rows from
  //                 before extractor improvements landed.
  //   handshake   — only emails whose sender is joinhandshake.com. Use after
  //                 changing the Handshake template pre-filter or prompt rules.
  //   unclassified — emails the original sender filter dropped (classifiedAt
  //                 IS NULL), filtered down to ones that now pass the
  //                 career-pattern domain check or have a strong subject
  //                 marker. Use after broadening the sender filter to surface
  //                 misses without re-LLM'ing every email.
  //   (no mode)   — every email the user has fetched. Slowest, most expensive.
  const mode = req.nextUrl.searchParams.get('mode');
  const targeted = mode === 'targeted';
  const needsFix = mode === 'needs-fix';
  const handshake = mode === 'handshake';
  const unclassified = mode === 'unclassified';

  const rules = await db
    .select()
    .from(userSenderRules)
    .where(eq(userSenderRules.userId, userId));
  const userRules: UserSenderRuleSet = {
    allow: new Set(rules.filter((r) => r.type === 'allow').map((r) => r.domain.toLowerCase())),
    block: new Set(rules.filter((r) => r.type === 'block').map((r) => r.domain.toLowerCase())),
  };

  let badAppIds: string[] = [];
  if (targeted || needsFix) {
    const appRows = await db
      .select({ id: applications.id, company: applications.company, role: applications.role })
      .from(applications)
      .where(eq(applications.userId, userId));
    badAppIds = appRows
      .filter((r) => {
        const vendor = isAtsVendorName(r.company);
        if (targeted) return vendor;
        // needs-fix: vendor OR missing role
        return vendor || !r.role || r.role.trim() === '';
      })
      .map((r) => r.id);
  }

  const filterByApps = targeted || needsFix;

  let targetsWhere = eq(emailMessages.userId, userId);
  if (filterByApps && badAppIds.length > 0) {
    targetsWhere = and(
      eq(emailMessages.userId, userId),
      inArray(emailMessages.applicationId, badAppIds),
    )!;
  } else if (handshake) {
    // Match the from_domain on the stored email row instead of round-tripping
    // through Gmail. The classifier's Handshake pre-filter and prompt updates
    // operate on what's already in the DB, so this is sufficient.
    const handshakeMatch = or(
      eq(emailMessages.fromDomain, 'joinhandshake.com'),
      ilike(emailMessages.fromDomain, '%.joinhandshake.com'),
    )!;
    targetsWhere = and(eq(emailMessages.userId, userId), handshakeMatch)!;
  } else if (unclassified) {
    targetsWhere = and(
      eq(emailMessages.userId, userId),
      isNull(emailMessages.classifiedAt),
    )!;
  }

  let targets = await db.select().from(emailMessages).where(targetsWhere);

  // For `unclassified`, narrow in JS to rows that *now* pass the broadened
  // filter — saves Gemini quota by skipping rows that would still be dropped.
  if (unclassified) {
    targets = targets.filter(
      (t) =>
        looksLikeCareerSender(t.fromDomain) || hasJobApplicationSubjectMarker(t.subject),
    );
  }

  if (filterByApps && badAppIds.length === 0) {
    return NextResponse.json({
      mode,
      reclassified: 0,
      ignored: 0,
      failed: 0,
      orphansDeleted: 0,
      targets: 0,
      message:
        targeted
          ? 'No applications with vendor-name companies to reclassify.'
          : 'No applications with vendor-name companies or missing roles.',
      durationMs: Date.now() - started,
    });
  }

  if (targets.length === 0) {
    return NextResponse.json({
      mode: mode ?? 'all',
      reclassified: 0,
      failed: 0,
      orphansDeleted: 0,
      targets: 0,
      durationMs: Date.now() - started,
    });
  }

  // Multi-inbox: Handshake emails (and any email older than the connection_id
  // wiring) could live in any of the user's inboxes. Try each client until one
  // returns the message.
  const clients = await listGmailClients(userId);
  if (clients.length === 0) {
    return NextResponse.json({ error: 'no_gmail_connection' }, { status: 400 });
  }
  const fetchMessage = async (gmailMessageId: string) => {
    let lastError: unknown = null;
    for (const c of clients as GmailClientHandle[]) {
      try {
        return await c.gmail.users.messages.get({
          userId: 'me',
          id: gmailMessageId,
          format: 'full',
        });
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('failed to fetch from any inbox');
  };

  // Snapshot the set of applications that existed BEFORE we re-pointed any
  // emails. Anything in this set that ends up with zero email references after
  // the pass is an orphan we can delete (e.g. the old "greenhouse-mail" rows).
  const beforeApps = await db
    .select()
    .from(applications)
    .where(eq(applications.userId, userId));
  // When targeted/needs-fix, only consider the in-scope apps as deletion
  // candidates. (We don't want to delete unrelated apps that happen to have
  // no emails left.)
  const candidateOrphanIds = new Set(
    (filterByApps
      ? beforeApps.filter((a) => badAppIds.includes(a.id))
      : beforeApps.filter((a) => !a.manualOverride && !a.notes)
    ).map((a) => a.id),
  );

  let reclassified = 0;
  let failed = 0;
  let ignored = 0;
  const errors: Array<{ gmailMessageId: string; error: string }> = [];

  for (const em of targets) {
    try {
      const res = await fetchMessage(em.gmailMessageId);
      const normalized = normalizeGmailMessage(res.data);
      if (!normalized) {
        failed++;
        errors.push({ gmailMessageId: em.gmailMessageId, error: 'normalize_failed' });
        continue;
      }
      const classification = await classify(normalized, userRules);
      if (classification.label === 'ignore') {
        ignored++;
        // Reclassify decided this isn't a job event after all. Detach it from
        // whatever (likely wrong) application it was pointing at — otherwise
        // the orphan-deletion at the bottom can never clean up the bad row,
        // and a future `unclassified` reclassify will keep re-targeting it.
        await db
          .update(emailMessages)
          .set({ applicationId: null, classifiedAt: new Date() })
          .where(eq(emailMessages.id, em.id));
      } else {
        await upsertApplicationFromClassification({
          userId,
          email: normalized,
          emailMessageRowId: em.id,
          classification,
        });
      }
      reclassified++;
    } catch (err) {
      failed++;
      // Dev-only route, but keep the same no-leak discipline as prod: log the
      // real exception, return a stable label so the dev UI can render it.
      console.error(
        JSON.stringify({
          kind: 'reclassify_error',
          gmailMessageId: em.gmailMessageId,
          cause: (err instanceof Error ? err.message : String(err)).slice(0, 500),
        }),
      );
      errors.push({ gmailMessageId: em.gmailMessageId, error: 'reclassify_failed' });
    }
  }

  // Find candidate-orphan applications that no longer have any emails pointing
  // at them after the reclassification pass.
  let orphansDeleted = 0;
  if (candidateOrphanIds.size > 0) {
    const stillReferenced = await db
      .select({ applicationId: emailMessages.applicationId })
      .from(emailMessages)
      .where(
        and(
          eq(emailMessages.userId, userId),
          isNotNull(emailMessages.applicationId),
          inArray(emailMessages.applicationId, Array.from(candidateOrphanIds)),
        ),
      );
    const referenced = new Set<string>();
    for (const r of stillReferenced) {
      if (r.applicationId) referenced.add(r.applicationId);
    }
    const orphanIds = Array.from(candidateOrphanIds).filter((id) => !referenced.has(id));
    if (orphanIds.length > 0) {
      const deleted = await db
        .delete(applications)
        .where(and(eq(applications.userId, userId), inArray(applications.id, orphanIds)))
        .returning({ id: applications.id });
      orphansDeleted = deleted.length;
    }
  }

  revalidateTag('applications');

  return NextResponse.json({
    mode: mode ?? 'all',
    badAppIds: filterByApps ? badAppIds.length : undefined,
    reclassified,
    ignored,
    failed,
    orphansDeleted,
    targets: targets.length,
    durationMs: Date.now() - started,
    errors: errors.slice(0, 10),
  });
}
