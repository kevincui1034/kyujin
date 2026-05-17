import { NextResponse, type NextRequest } from 'next/server';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { runRefreshWatches } from '@/lib/refresh-watches';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return runRefreshWatches();
}
