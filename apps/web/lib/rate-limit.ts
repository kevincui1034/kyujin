import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { rateLimitEvents } from '@kyujin/db/schema';
import { apiError } from './api-errors';
import type { NextResponse } from 'next/server';

// Window vocabulary. Map to milliseconds in one place so callers stay
// declarative. Add new ones here as they're needed — keep the list small.
export type RateLimitWindow = '1m' | '1h' | '1d';

const WINDOW_MS: Record<RateLimitWindow, number> = {
  '1m': 60 * 1000,
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

export interface RateLimitOptions {
  userId: string;
  // Bucket name. Use a stable string like `'applications:bulk'` so all writes
  // for the same logical action share a counter.
  key: string;
  window: RateLimitWindow;
  max: number;
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number; limit: number; used: number };

// Slide-by-row counter. Counts rows in the window, refuses if at cap, then
// inserts a new row. Same intentional race-condition tolerance as the
// existing chat_usage limiter — at the window boundary two concurrent
// requests can both pass the check, putting the user one over the cap.
// That's cheaper than locking and acceptable for "stop the abusive client"
// semantics.
export async function rateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  const windowMs = WINDOW_MS[opts.window];
  const since = new Date(Date.now() - windowMs);

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(rateLimitEvents)
    .where(
      and(
        eq(rateLimitEvents.userId, opts.userId),
        eq(rateLimitEvents.key, opts.key),
        gte(rateLimitEvents.createdAt, since),
      ),
    );
  const used = row?.count ?? 0;
  if (used >= opts.max) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
      limit: opts.max,
      used,
    };
  }
  await db.insert(rateLimitEvents).values({ userId: opts.userId, key: opts.key });
  return { ok: true };
}

// Convenience: convert a rate-limit miss into a 429 response with the right
// Retry-After header. Returns `null` when the check passed, so the caller
// can `if (limited) return limited;` at the top of the handler.
export async function enforceRateLimit(opts: RateLimitOptions): Promise<NextResponse | null> {
  const result = await rateLimit(opts);
  if (result.ok) return null;
  return apiError('rate_limited', {
    details: { limit: result.limit, used: result.used },
    headers: { 'Retry-After': String(result.retryAfterSeconds) },
  });
}
