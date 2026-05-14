import { NextResponse, type NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { getStats } from '@/lib/data';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const stats = await getStats(userId);
  return NextResponse.json(stats);
}
