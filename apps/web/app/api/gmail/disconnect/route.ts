import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { gmailConnections } from '@kyujin/db/schema';
import { auth } from '@/auth';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  await db.delete(gmailConnections).where(eq(gmailConnections.userId, session.user.id));
  return NextResponse.json({ ok: true });
}
