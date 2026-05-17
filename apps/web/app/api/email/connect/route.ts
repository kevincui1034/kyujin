import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes, createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@kyujin/db/client';
import { nylasConnections, users } from '@kyujin/db/schema';
import { buildAuthUrl } from '@kyujin/shared/nylas';
import { NON_PREMIUM_INBOX_LIMIT, PREMIUM_INBOX_LIMIT } from '@/lib/plan';

// Nylas equivalent of /api/gmail/connect. Issues a signed state nonce so
// the callback can identify the user without a server-side session store,
// then redirects to Nylas's hosted-auth page.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'AUTH_SECRET not configured' }, { status: 500 });
  }

  // Per-plan inbox cap. Counts only nylas_connections — any gmail_connections
  // rows are legacy from the pre-migration provider and will be retired.
  const existing = await db
    .select({ id: nylasConnections.id })
    .from(nylasConnections)
    .where(eq(nylasConnections.userId, session.user.id));

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
      return NextResponse.redirect(new URL(`/app/settings?gmail_error=${code}`, req.url));
    }
  }

  const nonce = randomBytes(16).toString('hex');
  const payload = `${session.user.id}.${nonce}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  const state = `${payload}.${sig}`;

  return NextResponse.redirect(buildAuthUrl(state));
}
