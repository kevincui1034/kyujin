import { NextResponse, type NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { nylasConnections, users } from '@kyujin/db/schema';
import { exchangeCode } from '@kyujin/shared/nylas';
import { inboxLimitForPlan } from '@/lib/plan';

function verifyState(state: string, secret: string): string | null {
  const parts = state.split('.');
  if (parts.length !== 3) return null;
  const [userId, nonce, sig] = parts as [string, string, string];
  const expected = createHmac('sha256', secret).update(`${userId}.${nonce}`).digest('hex');
  const sigBuf = Buffer.from(sig, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expBuf)) return null;
  return userId;
}

// Nylas hosted-auth return URL. Verifies the signed state, exchanges the
// code for a grant_id, and upserts a nylas_connections row.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL(`/app/settings?gmail_error=${error}`, req.url));
  }
  if (!code || !state) {
    return NextResponse.json({ error: 'missing code or state' }, { status: 400 });
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'AUTH_SECRET not configured' }, { status: 500 });
  }

  const userId = verifyState(state, secret);
  if (!userId) {
    return NextResponse.json({ error: 'invalid state' }, { status: 400 });
  }

  // Defense in depth: if the user row vanished between issuing state and
  // returning here (DB reset, manual delete), bounce to login rather than
  // letting the FK violation bubble as a 500.
  const [userRow] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!userRow) {
    return NextResponse.redirect(new URL('/login?reason=session-expired', req.url));
  }

  const { grantId, emailAddress } = await exchangeCode(code);
  if (!grantId || !emailAddress) {
    return NextResponse.json({ error: 'nylas did not return a grant' }, { status: 502 });
  }

  // Per-plan inbox cap recheck — /connect short-circuits this at flow start
  // but a stale tab or hand-crafted state could still land us here.
  const existing = await db
    .select({ emailAddress: nylasConnections.emailAddress })
    .from(nylasConnections)
    .where(eq(nylasConnections.userId, userId));
  const isAddingNewInbox =
    existing.length > 0 && !existing.some((c) => c.emailAddress === emailAddress);
  if (isAddingNewInbox) {
    const [user] = await db
      .select({ plan: users.plan })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const limit = inboxLimitForPlan(user?.plan);
    if (existing.length >= limit) {
      const code = user?.plan === 'premium' ? 'inbox_limit_reached' : 'premium_required';
      return NextResponse.redirect(new URL(`/app/settings?gmail_error=${code}`, req.url));
    }
  }

  await db
    .insert(nylasConnections)
    .values({
      userId,
      emailAddress,
      grantId,
      provider: 'google',
    })
    .onConflictDoUpdate({
      target: [nylasConnections.userId, nylasConnections.emailAddress],
      set: {
        grantId,
        // Reconnect resets the needsReauth flag from prior grant.expired events.
        needsReauth: false,
        updatedAt: new Date(),
      },
    });

  return NextResponse.redirect(new URL('/app/settings?gmail=connected', req.url));
}
