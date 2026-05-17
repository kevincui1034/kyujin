import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes, createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@kyujin/db/client';
import { gmailConnections, users } from '@kyujin/db/schema';
import { buildAuthUrl } from '@kyujin/shared/gmail';
import { NON_PREMIUM_INBOX_LIMIT, PREMIUM_INBOX_LIMIT } from '@/lib/plan';

// Returns the consent URL. The state is signed with AUTH_SECRET so the callback
// can verify it belongs to this user without a server-side session store.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'AUTH_SECRET not configured' }, { status: 500 });
  }

  // Multi-inbox is Premium-only. Premium caps at PREMIUM_INBOX_LIMIT;
  // Standard (and unsubscribed) caps at NON_PREMIUM_INBOX_LIMIT (1).
  // If the user is already at their cap, short-circuit back to settings with
  // an error/notice rather than starting an OAuth flow that the callback
  // would reject.
  const existing = await db
    .select({ id: gmailConnections.id })
    .from(gmailConnections)
    .where(eq(gmailConnections.userId, session.user.id));

  if (existing.length > 0) {
    const [user] = await db
      .select({ plan: users.plan })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    const isPremium = user?.plan === 'premium';
    const limit = isPremium ? PREMIUM_INBOX_LIMIT : NON_PREMIUM_INBOX_LIMIT;
    if (existing.length >= limit) {
      const code = isPremium ? 'inbox_limit_reached' : 'premium_required';
      return NextResponse.redirect(
        new URL(`/app/settings?gmail_error=${code}`, req.url),
      );
    }
  }

  const nonce = randomBytes(16).toString('hex');
  const payload = `${session.user.id}.${nonce}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  const state = `${payload}.${sig}`;

  return NextResponse.redirect(buildAuthUrl(state));
}
