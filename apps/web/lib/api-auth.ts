import { type NextRequest } from 'next/server';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { sessions, users } from '@kyujin/db/schema';
import { auth } from '@/auth';

// Resolve the authenticated user for an API request. Accepts EITHER:
//   1. An Auth.js cookie session (the normal web path), or
//   2. An `Authorization: Bearer <sessionToken>` header (iOS path — the
//      session token is looked up directly in the same `sessions` table
//      that Auth.js writes to via the DrizzleAdapter).
//
// Returns `null` if neither identifies a live session. Callers should respond
// with 401.
export async function getAuthUserId(req: NextRequest): Promise<string | null> {
  // 1. Cookie session via Auth.js
  const session = await auth();
  if (session?.user?.id) return session.user.id;

  // 2. Bearer token → sessions table lookup
  const header = req.headers.get('authorization');
  const match = header?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) return null;

  const rows = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.sessionToken, token), gt(sessions.expires, new Date())))
    .limit(1);

  return rows[0]?.userId ?? null;
}
