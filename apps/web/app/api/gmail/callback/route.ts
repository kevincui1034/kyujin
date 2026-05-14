import { NextResponse, type NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { google } from 'googleapis';
import { db } from '@kyujin/db/client';
import { gmailConnections } from '@kyujin/db/schema';
import { exchangeCode } from '@kyujin/shared/gmail';

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
