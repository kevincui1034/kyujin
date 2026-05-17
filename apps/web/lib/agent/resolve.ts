import { and, desc, eq, isNotNull, lt } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { applications } from '@kyujin/db/schema';
import type { ApplicationFilter, AgentAppRow } from './tools';

// Loose normalizer for fuzzy company matching from chat. Mirrors the spirit
// of packages/shared/src/applications.ts:normalizeForMatch — case folded,
// punctuation collapsed — but inlined here so we don't widen the shared
// package's surface for one consumer.
function normalize(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toRow(r: typeof applications.$inferSelect): AgentAppRow {
  return {
    id: r.id,
    company: r.company,
    role: r.role,
    status: r.status,
    lastEventAt: r.lastEventAt.toISOString(),
  };
}

// Resolve a filter into a concrete row list, scoped to the calling user.
// Used by the chat to:
//   - render previews for bulk_update (count + sample rows)
//   - render the list for query_applications
//   - back the candidate picker when the model emits a `clarify`
export async function resolveFilter(
  userId: string,
  filter: ApplicationFilter,
  limit = 100,
): Promise<AgentAppRow[]> {
  const conds = [eq(applications.userId, userId)];
  if (filter.status) conds.push(eq(applications.status, filter.status));
  if (filter.ghostedPastDays !== undefined) {
    const cutoff = new Date(Date.now() - filter.ghostedPastDays * 24 * 3600 * 1000);
    conds.push(isNotNull(applications.ghostedAt));
    conds.push(lt(applications.ghostedAt, cutoff));
  }

  const rows = await db
    .select()
    .from(applications)
    .where(and(...conds))
    .orderBy(desc(applications.lastEventAt));

  // Company filter is applied in JS so we get fuzzy matching ("stripe"
  // matches "Stripe, Inc." and "Stripe Capital"). DB ILIKE would require
  // exact substring; this catches normalized substring.
  const companyNeedle = filter.company ? normalize(filter.company) : null;
  const filtered = companyNeedle
    ? rows.filter((r) => normalize(r.company).includes(companyNeedle))
    : rows;

  return filtered.slice(0, limit).map(toRow);
}

// Pre-fetch the user's most-recent applications for the system prompt.
// Limit to a reasonable upper bound — the model only needs enough to resolve
// references like "the Stripe one" or "all my Acme applications".
const SYSTEM_PROMPT_APP_LIMIT = 200;

export async function fetchApplicationsForPrompt(userId: string): Promise<AgentAppRow[]> {
  const rows = await db
    .select()
    .from(applications)
    .where(eq(applications.userId, userId))
    .orderBy(desc(applications.lastEventAt))
    .limit(SYSTEM_PROMPT_APP_LIMIT);
  return rows.map(toRow);
}
