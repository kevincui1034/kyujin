import { NextResponse, type NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { listApplications } from '@/lib/data';
import type { ApplicationStatus } from '@kyujin/shared';
import { APPLICATION_STATUSES } from '@kyujin/shared';

export const dynamic = 'force-dynamic';

function isStatus(value: string | null): value is ApplicationStatus {
  return !!value && (APPLICATION_STATUSES as readonly string[]).includes(value);
}

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const statusParam = req.nextUrl.searchParams.get('status');
  const status = isStatus(statusParam) ? statusParam : undefined;
  const applications = await listApplications(userId, { status });
  return NextResponse.json({ applications });
}
