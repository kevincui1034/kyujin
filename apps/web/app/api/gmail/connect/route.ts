import { NextResponse } from 'next/server';
import { randomBytes, createHmac } from 'node:crypto';
import { auth } from '@/auth';
import { buildAuthUrl } from '@kyujin/shared/gmail';

// Returns the consent URL. The state is signed with AUTH_SECRET so the callback
// can verify it belongs to this user without a server-side session store.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'AUTH_SECRET not configured' }, { status: 500 });
  }

  const nonce = randomBytes(16).toString('hex');
  const payload = `${session.user.id}.${nonce}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  const state = `${payload}.${sig}`;

  return NextResponse.redirect(buildAuthUrl(state));
}
