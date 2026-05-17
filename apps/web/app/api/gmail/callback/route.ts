import { NextResponse, type NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { google } from 'googleapis';
import { db } from '@kyujin/db/client';
import { gmailConnections, users } from '@kyujin/db/schema';
import { exchangeCode } from '@kyujin/shared/gmail';
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

  // Defense in depth: if the user row vanished between issuing the OAuth state
  // and Google redirecting back (DB reset, manual delete), bounce to login
  // instead of letting the FK violation bubble up as a 500.
  const [userRow] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!userRow) {
    return NextResponse.redirect(new URL('/login?reason=session-expired', req.url));
  }

  const tokens = await exchangeCode(code);
  if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
    return NextResponse.json(
      { error: 'Google did not return a refresh token. Try revoking access at myaccount.google.com first.' },
      { status: 400 },
    );
  }

  // Fetch the email address using the freshly-issued credentials.
  const oauth = new google.auth.OAuth2();
  oauth.setCredentials(tokens);
  const profile = await google.oauth2('v2').userinfo.get({ auth: oauth });
  const emailAddress = profile.data.email;
  if (!emailAddress) {
    return NextResponse.json({ error: 'could not resolve Gmail address' }, { status: 400 });
  }

  // Per-plan inbox cap. /api/gmail/connect short-circuits this case at the
  // start of the OAuth flow, but a stale tab or hand-crafted state could still
  // land us here, so re-check before inserting.
  const existing = await db
    .select({ emailAddress: gmailConnections.emailAddress })
    .from(gmailConnections)
    .where(eq(gmailConnections.userId, userId));
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
    .insert(gmailConnections)
    .values({
      userId,
      emailAddress,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(tokens.expiry_date),
      scope: tokens.scope ?? 'https://www.googleapis.com/auth/gmail.readonly',
    })
    .onConflictDoUpdate({
      target: [gmailConnections.userId, gmailConnections.emailAddress],
      set: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(tokens.expiry_date),
        scope: tokens.scope ?? 'https://www.googleapis.com/auth/gmail.readonly',
        updatedAt: new Date(),
      },
    });

  return NextResponse.redirect(new URL('/app/settings?gmail=connected', req.url));
}
