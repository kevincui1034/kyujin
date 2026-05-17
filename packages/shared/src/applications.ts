import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { applications, emailMessages, classifications } from '@kyujin/db/schema';
import {
  extractAtsCompanyRole,
  extractJobId,
  isAtsSenderDomain,
  isAtsVendorName,
  normalizeJobId,
} from './ats-extractor';
import { resolveBrandAlias } from './brand-aliases';
import type { ApplicationStatus, ClassificationResult, NormalizedEmail } from './types';

// Punctuation/whitespace/case-insensitive baseline normalizer. Every match
// tier funnels strings through this last.
function normalizeForMatch(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Canonicalize a company string for matching: lowercase + punctuation strip,
// then resolve consumer-brand aliases to the parent ("tiktok" → "bytedance").
// Used by buildMatchKey AND every match tier so the DB unique constraint and
// in-memory tier ladder agree on identity.
function canonicalizeCompany(s: string | null | undefined): string {
  return resolveBrandAlias(normalizeForMatch(s));
}

// Iterative Levenshtein distance, O(n*m) time, O(min(n,m)) space. Used only
// to break ties between multiple loose-tier matches; not on a hot path. Cap
// inputs at LEVENSHTEIN_MAX_CHARS so a pathological multi-paragraph role
// string doesn't make the tiebreak quadratic in input size.
const LEVENSHTEIN_MAX_CHARS = 256;
function levenshtein(rawA: string, rawB: string): number {
  const a = rawA.length > LEVENSHTEIN_MAX_CHARS ? rawA.slice(0, LEVENSHTEIN_MAX_CHARS) : rawA;
  const b = rawB.length > LEVENSHTEIN_MAX_CHARS ? rawB.slice(0, LEVENSHTEIN_MAX_CHARS) : rawB;
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const m = a.length;
  const n = b.length;
  const dp = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j]!;
      dp[j] =
        a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, dp[j]!, dp[j - 1]!);
      prev = temp;
    }
  }
  return dp[n]!;
}

// ── Role strip layers, cumulative ─────────────────────────────────────────
// Each tier composes the strips of the previous tier and adds one more.
// Because each strip is a deterministic transformation, matches at tier i
// are a subset of matches at tier i+1 (proof by composition: strip is
// idempotent under equal inputs). The order matters — we relax "smaller"
// content first (abbreviations, then req IDs, then location, then work-mode).

// Short, non-numeric parentheticals like (SDET), (Hybrid), (Remote), (Intern).
// Skip parens that look like req IDs — those belong to tier 2.
function stripNoiseParens(s: string): string {
  return s.replace(/\(\s*([^)]{1,18})\s*\)/g, (_, content: string) => {
    if (/\d/.test(content)) return `(${content})`;
    if (/\b(?:req|reqid|requisition|posting|id|job\s*id|ref|reference)\b/i.test(content)) {
      return `(${content})`;
    }
    return ' ';
  });
}

// Any remaining parentheticals after the noise pass — typically req IDs.
function stripReqIdParens(s: string): string {
  return s.replace(/\([^)]*\)/g, ' ');
}

// Trailing "..., City, ST [...]" pattern that ATS templates append.
function stripLocationTail(s: string): string {
  return s.replace(/,\s*[A-Za-z .'\-]+,\s*[A-Z]{2}\b.*/g, ' ');
}

// Work-mode words at the end of the role line.
function stripWorkMode(s: string): string {
  return s.replace(
    /,?\s*\b(?:remote|hybrid|on-?site|full[- ]?time|part[- ]?time|contract|intern(?:ship)?)\b.*/gi,
    ' ',
  );
}

// Common corporate-name suffixes ("Inc.", "LLC", "Systems", "Technologies", …)
// in English plus the most common international forms. Loops until the result
// stabilizes so chained suffixes ("Boston Consulting Group LLC") collapse.
const COMPANY_SUFFIX_RX =
  /\b(?:inc|llc|ltd|limited|corp(?:oration)?|co|company|systems?|technologies|tech|solutions|labs?|consulting|services|industries|holdings|partners|group|capital|ventures|enterprises|foundation|gmbh|ag|kg|s\.?a\.?|s\.?p\.?a\.?|pte\.?\s*ltd|k\.?k\.?|pty\.?\s*ltd|b\.?v\.?|n\.?v\.?|sarl|sas|ab|oy|as)\b\.?[\s,]*$/gi;

function stripCompanySuffix(s: string): string {
  let prev = '';
  let out = s;
  while (out !== prev) {
    prev = out;
    out = out.replace(COMPANY_SUFFIX_RX, '').trim();
  }
  return out;
}

const ROLE_TIERS: Array<(s: string) => string> = [
  (s) => s,
  (s) => stripNoiseParens(s),
  (s) => stripReqIdParens(stripNoiseParens(s)),
  (s) => stripLocationTail(stripReqIdParens(stripNoiseParens(s))),
  (s) => stripWorkMode(stripLocationTail(stripReqIdParens(stripNoiseParens(s)))),
];

// Total tier count = role tiers + 1 loose company tier appended at the end.
const TOTAL_TIERS = ROLE_TIERS.length + 1;
const LOOSEST_TIER_INDEX = TOTAL_TIERS - 1;

// Within-1-year gate kicks in for everything past the strictest tier. Exact
// (company, role) matches at tier 0 are their own evidence and ignore the
// window; looser matches need temporal proximity to avoid collapsing
// genuine re-applications.
const TIER1_WINDOW_MS = 365 * 24 * 3600 * 1000;

function buildMatchTiers(
  company: string,
  role: string | null,
): Array<{ company: string; role: string }> {
  const r = role ?? '';
  const canonCompany = canonicalizeCompany(company);
  const tiers: Array<{ company: string; role: string }> = ROLE_TIERS.map((fn) => ({
    company: canonCompany,
    role: normalizeForMatch(fn(r)),
  }));
  // Loosest tier: company suffix dropped, role at its most-stripped form.
  // Suffix strip + alias resolution are both deterministic, idempotent
  // transformations so the monotonicity invariant still holds.
  tiers.push({
    company: resolveBrandAlias(normalizeForMatch(stripCompanySuffix(company))),
    role: normalizeForMatch(ROLE_TIERS[ROLE_TIERS.length - 1]!(r)),
  });
  return tiers;
}

// One-time invariant probes in dev. Checks two properties at module load,
// logs (never throws) on violation:
//   1. Monotonicity: if two inputs match at tier i, they MUST match at every
//      looser tier j > i. Because each tier composes additional deterministic
//      strips onto the previous, equality is preserved. Verifying this with
//      sampled input pairs catches regressions when someone adds a new tier
//      or strip operation that doesn't compose cleanly.
//   2. Non-collapse: the strictest tier must never produce an empty company
//      for a non-empty input (would over-merge everything).
if (process.env.NODE_ENV !== 'production') {
  const sampleCompanies = [
    'Cisco',
    'Cisco Systems, Inc.',
    'Adobe',
    'Adobe Systems',
    'Boston Consulting Group LLC',
    'Acme GmbH',
    'Sony Pte Ltd',
    'foundation',
  ];
  const sampleRoles: Array<string | null> = [
    null,
    '',
    'Software Engineer',
    'Software Engineer (SDET)',
    'Software Engineer (Req. 1234)',
    'Software Engineer (SDET), Hybrid, Milpitas, CA',
    'Senior Engineer, Remote',
    'Engineer, San Francisco, CA, Full-Time',
  ];

  for (const c of sampleCompanies) {
    const ts = buildMatchTiers(c, null);
    if (ts[0]!.company === '') {
      // eslint-disable-next-line no-console
      console.warn('[applications] strictest tier produced empty company for', c);
    }
  }

  // Cross-pair monotonicity. For every pair (A, B) and every tier i, if A and
  // B match at tier i then they must match at all tiers i+1..n.
  const pairs: Array<[[string, string | null], [string, string | null]]> = [];
  for (const c1 of sampleCompanies) {
    for (const c2 of sampleCompanies) {
      for (const r1 of sampleRoles) {
        for (const r2 of sampleRoles) {
          pairs.push([[c1, r1], [c2, r2]]);
        }
      }
    }
  }
  for (const [a, b] of pairs) {
    const ta = buildMatchTiers(a[0], a[1]);
    const tb = buildMatchTiers(b[0], b[1]);
    let matchedAt = -1;
    for (let i = 0; i < ta.length; i++) {
      if (ta[i]!.company === tb[i]!.company && ta[i]!.role === tb[i]!.role) {
        matchedAt = i;
        break;
      }
    }
    if (matchedAt < 0) continue;
    for (let j = matchedAt + 1; j < ta.length; j++) {
      if (ta[j]!.company !== tb[j]!.company || ta[j]!.role !== tb[j]!.role) {
        // eslint-disable-next-line no-console
        console.warn(
          '[applications] monotonicity violation: matched at tier',
          matchedAt,
          'but not at tier',
          j,
          JSON.stringify(a),
          'vs',
          JSON.stringify(b),
        );
        break;
      }
    }
  }
}

interface MatchCandidate {
  id: string;
  company: string;
  role: string | null;
  jobId: string | null;
  lastEventAt: Date;
  sourceDomain: string | null;
}

// Walks tiers strict → loose. Within a tier, collects ALL matching
// candidates, then ranks: most recent lastEventAt wins; ties broken by
// raw-string Levenshtein distance to the new (company, role).
// Loosest tier has extra gates: requires non-empty role on both sides AND
// matching sourceDomain when both sides have one (the same ATS routing is
// strong evidence the looser company match isn't a coincidence).
//
// Job-ID tier runs BEFORE the text tiers when both sides have a jobId.
// (canonical company, jobId) is near-deterministic for ATS templates — the
// same req ID on the same employer is the same posting. This bridges the
// common case where the role string varies between application-receipt and
// rejection (location suffix added/dropped, "96191 - " prefix kept/stripped).
function findTieredMatch<T extends MatchCandidate>(
  candidates: T[],
  newCompany: string,
  newRole: string | null,
  newReceivedAt: Date,
  newSourceDomain: string | null,
  newJobId: string | null,
): T | null {
  if (newJobId) {
    const newCompanyCanon = canonicalizeCompany(newCompany);
    const jobIdHits: T[] = [];
    for (const c of candidates) {
      if (!c.jobId || c.jobId !== newJobId) continue;
      if (canonicalizeCompany(c.company) !== newCompanyCanon) continue;
      jobIdHits.push(c);
    }
    if (jobIdHits.length === 1) return jobIdHits[0]!;
    if (jobIdHits.length > 1) {
      jobIdHits.sort((a, b) => b.lastEventAt.getTime() - a.lastEventAt.getTime());
      return jobIdHits[0]!;
    }
  }

  const newTiers = buildMatchTiers(newCompany, newRole);
  const candidateTiers = candidates.map((c) => buildMatchTiers(c.company, c.role));
  const newRoleNorm = normalizeForMatch(newRole);
  const newCompanyNorm = canonicalizeCompany(newCompany);

  for (let tier = 0; tier < newTiers.length; tier++) {
    const target = newTiers[tier]!;
    const isLoosest = tier === LOOSEST_TIER_INDEX;

    // Symmetric empty-role skip at non-loosest tiers — empty == empty over-merges
    // unrelated jobs whose tier-N strip happens to land on an empty string.
    const newRoleEmpty = target.role === '';

    const hits: Array<T> = [];
    for (let i = 0; i < candidates.length; i++) {
      const cand = candidateTiers[i]![tier]!;
      const candRoleEmpty = cand.role === '';

      if (!isLoosest && (newRoleEmpty || candRoleEmpty)) continue;
      if (cand.company !== target.company) continue;
      if (cand.role !== target.role) continue;

      // Loosest-tier gates.
      if (isLoosest) {
        if (newRoleEmpty || candRoleEmpty) continue;
        if (
          newSourceDomain &&
          candidates[i]!.sourceDomain &&
          newSourceDomain !== candidates[i]!.sourceDomain
        ) {
          continue;
        }
      }

      // Time-window gate for everything past tier 0.
      if (tier >= 1) {
        const dt = Math.abs(
          newReceivedAt.getTime() - candidates[i]!.lastEventAt.getTime(),
        );
        if (dt > TIER1_WINDOW_MS) continue;
      }

      hits.push(candidates[i]!);
    }

    if (hits.length === 0) continue;
    if (hits.length === 1) return hits[0]!;

    // Tiebreak: most recent first, then closest raw-string distance.
    hits.sort((a, b) => {
      const dt = b.lastEventAt.getTime() - a.lastEventAt.getTime();
      if (dt !== 0) return dt;
      const aRole = normalizeForMatch(a.role);
      const bRole = normalizeForMatch(b.role);
      const aDist =
        levenshtein(newCompanyNorm, canonicalizeCompany(a.company)) +
        levenshtein(newRoleNorm, aRole);
      const bDist =
        levenshtein(newCompanyNorm, canonicalizeCompany(b.company)) +
        levenshtein(newRoleNorm, bRole);
      return aDist - bDist;
    });
    return hits[0]!;
  }
  return null;
}

// ATS templates often thread separate role applications together by
// sender+subject collision (Workday's "Update from Cisco" lands every
// application in one Gmail thread). When the thread looks like that noise,
// don't trust it. Three or more distinct app rows in a single thread is the
// signature.
const THREAD_COLLISION_THRESHOLD = 3;

// Strict tier-0 identity key persisted in `applications.match_key`. Two rows
// with the same (user_id, match_key) are the same job; the DB unique
// constraint enforces this independently of any JS-side matching.
// Company is canonicalized (brand → parent) so "TikTok" and "ByteDance" map
// to the same key. Existing pre-alias rows keep their old key and stay
// discoverable via the in-memory tier ladder, which also canonicalizes.
export function buildMatchKey(company: string, role: string | null): string {
  return `${canonicalizeCompany(company)}|${normalizeForMatch(role)}`;
}

export const STATUS_PRECEDENCE: Record<ApplicationStatus, number> = {
  applied: 0,
  no_response: 1,
  interview: 2,
  rejected: 3,
  accepted: 4,
  obtained: 5,
};

export function strongerStatus(a: ApplicationStatus, b: ApplicationStatus): ApplicationStatus {
  return STATUS_PRECEDENCE[b] > STATUS_PRECEDENCE[a] ? b : a;
}

// Apply a classification result to the applications table: upsert by
// (userId, company, role) and bump status if the new label is stronger.
// Rejection always wins over interview (status precedence handles this), but
// interview does NOT downgrade a rejection — once rejected, stays rejected.
export async function upsertApplicationFromClassification(params: {
  userId: string;
  email: NormalizedEmail;
  emailMessageRowId: string;
  classification: ClassificationResult;
}): Promise<string | null> {
  const { userId, email, emailMessageRowId, classification } = params;
  if (classification.label === 'ignore') return null;

  const label = classification.label;
  // The classifier may emit `no_response`, but that's only meaningful as a
  // derived state. Treat it as applied for the purpose of creating a row.
  const status: ApplicationStatus = label === 'no_response' ? 'applied' : label;

  // The LLM occasionally returns the ATS platform ("Workday", "Greenhouse") in
  // `company` despite the prompt forbidding it. Drop those — the extractor or
  // domain fallback will be more accurate than what the model returned.
  const rawLlmCompany = classification.company?.trim();
  const llmCompany = isAtsVendorName(rawLlmCompany) ? undefined : rawLlmCompany;
  const llmRole = classification.role?.trim();
  const fallback = !llmCompany || !llmRole ? extractFromEmail(email) : null;
  const company = llmCompany || fallback?.company || fallbackCompany(email);
  const role = llmRole || fallback?.role || null;
  // jobId: regex first (deterministic, anchored on labels like "Ref:" /
  // "Job ID:" — no per-email LLM variance), with the LLM-extracted value as
  // a fallback for templates the regex doesn't recognize. Both paths go
  // through normalizeJobId so the stored value is always uppercase +
  // label-stripped, matching the form findTieredMatch compares against.
  const jobId =
    extractJobId({ subject: email.subject, body: email.body }) ??
    normalizeJobId(classification.jobId);

  // 1. Thread match (strongest, cheapest signal). If any OTHER email in this
  //    Gmail thread already maps to an application, that's almost certainly
  //    the right merge target. Gated by THREAD_COLLISION_THRESHOLD: when a
  //    thread carries 3+ distinct apps it's almost always ATS noise (Workday-
  //    style "Update from X" threads pile every role into one conversation),
  //    so we ignore the thread and fall through to text matching.
  const threadAppRows = await db
    .selectDistinct({ applicationId: emailMessages.applicationId })
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.userId, userId),
        eq(emailMessages.gmailThreadId, email.gmailThreadId),
        isNotNull(emailMessages.applicationId),
        ne(emailMessages.id, emailMessageRowId),
      ),
    );
  const threadAppIds = threadAppRows
    .map((r) => r.applicationId)
    .filter((id): id is string => id !== null);

  let match: typeof applications.$inferSelect | null = null;

  if (threadAppIds.length === 1) {
    const [row] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.userId, userId), eq(applications.id, threadAppIds[0]!)))
      .limit(1);
    match = row ?? null;
  } else if (
    threadAppIds.length > 1 &&
    threadAppIds.length < THREAD_COLLISION_THRESHOLD
  ) {
    const candidates = await db
      .select()
      .from(applications)
      .where(and(eq(applications.userId, userId), inArray(applications.id, threadAppIds)));
    match = findTieredMatch(
      candidates,
      company,
      role,
      email.receivedAt,
      email.fromDomain,
      jobId,
    );
  }

  // 2. Tiered text match. One query for all user apps — the previous ILIKE
  //    prefilter saved a few rows in exchange for double round-trips and
  //    couldn't surface the loosest-tier merges anyway. For active users
  //    (~hundreds of apps) the full pull is still a trivial query.
  if (!match) {
    const candidatesAll = await db
      .select()
      .from(applications)
      .where(eq(applications.userId, userId));
    match = findTieredMatch(
      candidatesAll,
      company,
      role,
      email.receivedAt,
      email.fromDomain,
      jobId,
    );
  }
  const matchKey = buildMatchKey(company, role);

  // Resolve to a single row: either the existing match, or a newly-inserted
  // row, or — if the insert lost a concurrent race — the row the other
  // worker just wrote (looked up by match_key). The unique constraint on
  // (user_id, match_key) is what makes this race-safe.
  let row: typeof applications.$inferSelect;
  if (match) {
    row = match;
  } else {
    const inserted = await db
      .insert(applications)
      .values({
        userId,
        company,
        role,
        sourceDomain: email.fromDomain,
        status,
        firstSeenAt: email.receivedAt,
        lastEventAt: email.receivedAt,
        matchKey,
        jobId,
      })
      .onConflictDoNothing({ target: [applications.userId, applications.matchKey] })
      .returning();
    if (inserted[0]) {
      row = inserted[0];
    } else {
      const [r] = await db
        .select()
        .from(applications)
        .where(and(eq(applications.userId, userId), eq(applications.matchKey, matchKey)))
        .limit(1);
      if (!r) throw new Error('match_key race lookup failed unexpectedly');
      row = r;
    }
  }

  const isFreshInsert = !match && row.firstSeenAt.getTime() === email.receivedAt.getTime();
  if (!isFreshInsert) {
    // Merge path. Bumps status (precedence-aware), advances lastEventAt when
    // newer, and refreshes sourceDomain under the origin-first rule:
    //   - keep current value if it's already a non-ATS origination signal
    //     (LinkedIn, Indeed, careers.cisco.com)
    //   - upgrade only when current is empty or is a generic ATS domain AND
    //     the incoming email is itself non-ATS
    //   - never let out-of-order backfill overwrite a confirmed origin
    const newStatus = strongerStatus(row.status, status);
    const newerEvent = row.lastEventAt < email.receivedAt;
    const existingDomain = row.sourceDomain;
    const incomingDomain = email.fromDomain;
    const existingIsOrigin = !!existingDomain && !isAtsSenderDomain(existingDomain);
    const incomingIsOrigin = !!incomingDomain && !isAtsSenderDomain(incomingDomain);
    let nextSourceDomain = existingDomain;
    if (!existingIsOrigin && incomingIsOrigin) {
      nextSourceDomain = incomingDomain;
    } else if (!existingDomain) {
      nextSourceDomain = incomingDomain;
    }
    // Persist jobId on the merge path when the existing row doesn't have one
    // yet — the receipt email might not carry an ID even when the rejection
    // does (and vice versa). First non-null wins; we don't overwrite an
    // existing ID, since a mismatch would suggest the merge itself is wrong.
    const nextJobId = row.jobId ?? jobId;
    await db
      .update(applications)
      .set({
        status: newStatus,
        sourceDomain: nextSourceDomain,
        lastEventAt: newerEvent ? email.receivedAt : row.lastEventAt,
        jobId: nextJobId,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, row.id));
  }
  const applicationId = row.id;

  await db
    .update(emailMessages)
    .set({ applicationId, classifiedAt: new Date() })
    .where(eq(emailMessages.id, emailMessageRowId));

  await db.insert(classifications).values({
    emailMessageId: emailMessageRowId,
    label: status,
    confidence: classification.confidence,
    method: classification.method,
    model: classification.model,
    promptTokens: classification.promptTokens,
    completionTokens: classification.completionTokens,
    company,
    role,
    jobId,
    raw: classification.raw as object | undefined,
  });

  return applicationId;
}

// Last-resort fallback when even the ATS extractor couldn't find a company.
// For ATS senders that put the company in the LOCAL part (e.g.
// `cisco@myworkday.com`, `apple@taleo.net`), prefer that over the domain.
// For everything else, fall back to the From-name then the domain root.
function fallbackCompany(email: NormalizedEmail): string {
  if (isAtsSenderDomain(email.fromDomain)) {
    const local = email.fromAddress.split('@')[0]?.toLowerCase() ?? '';
    if (local && local !== 'no-reply' && local !== 'noreply' && local !== 'donotreply' && local.length > 1) {
      return local;
    }
  }
  if (email.fromName && email.fromName.length > 1) return email.fromName;
  const parts = email.fromDomain.split('.');
  return parts.length > 1 ? parts[parts.length - 2]! : email.fromDomain;
}

// Body-based extraction for ATS templates. Only runs when the LLM left a hole
// (null/empty company or role). For ATS senders, the body is the only place
// the real company name lives — the From header is the ATS vendor.
function extractFromEmail(email: NormalizedEmail): { company: string | null; role: string | null } | null {
  if (!isAtsSenderDomain(email.fromDomain)) return null;
  return extractAtsCompanyRole({ subject: email.subject, body: email.body });
}
