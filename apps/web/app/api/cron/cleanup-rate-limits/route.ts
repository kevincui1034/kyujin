import { NextResponse, type NextRequest } from 'next/server';
import { lt } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { rateLimitEvents } from '@kyujin/db/schema';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { apiError } from '@/lib/api-errors';

export const dynamic = 'force-dynamic';

// Keep one week of rate-limit events. Comfortably longer than the longest
// window we enforce (1d) so the counter is never under-reported. Anything
// older serves no purpose and the table would grow indefinitely otherwise.
const RETENTION_DAYS = 7;

async function run() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  // postgres-js doesn't surface rowCount on delete; use `returning` so we
  // can report how much got reaped, which is the only signal we care about.
  const deleted = await db
    .delete(rateLimitEvents)
    .where(lt(rateLimitEvents.createdAt, cutoff))
    .returning({ id: rateLimitEvents.id });
  return NextResponse.json({
    deleted: deleted.length,
    cutoff: cutoff.toISOString(),
  });
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) return apiError('unauthenticated');
  return run();
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedCron(req)) return apiError('unauthenticated');
  return run();
}
