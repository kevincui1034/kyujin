import { type NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { applications } from '@kyujin/db/schema';
import { getAuthUserId, isPaidUser } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

// CSV is RFC 4180-compliant for the cells we emit: any field containing a
// comma, quote, CR, or LF is wrapped in quotes and embedded quotes doubled.
// Numbers and timestamps don't need escaping, but we run every field through
// the same path for consistency.
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const HEADERS = [
  'company',
  'role',
  'status',
  'source_domain',
  'first_seen_at',
  'last_event_at',
  'ghosted_at',
  'notes',
] as const;

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // Paid-plan gated: CSV/Sheets export is for standard + premium users.
  if (!(await isPaidUser(userId))) {
    return NextResponse.json({ error: 'paid_plan_required' }, { status: 402 });
  }

  const rows = await db
    .select({
      company: applications.company,
      role: applications.role,
      status: applications.status,
      sourceDomain: applications.sourceDomain,
      firstSeenAt: applications.firstSeenAt,
      lastEventAt: applications.lastEventAt,
      ghostedAt: applications.ghostedAt,
      notes: applications.notes,
    })
    .from(applications)
    .where(eq(applications.userId, userId));

  const lines: string[] = [];
  lines.push(HEADERS.join(','));
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.company),
        csvCell(r.role),
        csvCell(r.status),
        csvCell(r.sourceDomain),
        csvCell(r.firstSeenAt),
        csvCell(r.lastEventAt),
        csvCell(r.ghostedAt),
        csvCell(r.notes),
      ].join(','),
    );
  }
  const body = lines.join('\r\n') + '\r\n';
  const filename = `kyujin-applications-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
