import { NextResponse, type NextRequest } from 'next/server';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { runProcessBatch } from '@/lib/process-batch';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return runProcessBatch();
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return runProcessBatch();
}
