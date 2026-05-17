import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { applicationAudit, applications } from '@kyujin/db/schema';
import { auth } from '@/auth';
import {
  APPLICATION_SOURCES,
  APPLICATION_SOURCE_CANONICAL_DOMAIN,
  type ApplicationSource,
} from '@kyujin/shared';

export const dynamic = 'force-dynamic';

function isSource(v: unknown): v is ApplicationSource {
  return typeof v === 'string' && (APPLICATION_SOURCES as readonly string[]).includes(v);
}

// Manual source override. The source surfaced on the applications list is
// derived from `source_domain` via getApplicationSource(); we honor the
// user's correction by stamping the canonical domain for that source onto
// the row (or NULL for 'other'). Audit-logged so undo can restore.
// Body: { source: ApplicationSource }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await ctx.params;

  let source: ApplicationSource;
  try {
    const body = (await req.json()) as { source?: unknown };
    if (!isSource(body.source)) {
      return NextResponse.json({ error: 'invalid source' }, { status: 400 });
    }
    source = body.source;
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const [row] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.userId, userId), eq(applications.id, id)))
    .limit(1);
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const nextDomain =
    source === 'other' ? null : APPLICATION_SOURCE_CANONICAL_DOMAIN[source];

  if (row.sourceDomain === nextDomain) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  await db
    .update(applications)
    .set({ sourceDomain: nextDomain, manualOverride: 'source', updatedAt: new Date() })
    .where(and(eq(applications.userId, userId), eq(applications.id, id)));

  await db.insert(applicationAudit).values({
    userId,
    action: 'source_change',
    payload: {
      applicationId: id,
      previousSourceDomain: row.sourceDomain,
      newSourceDomain: nextDomain,
      newSource: source,
      previousManualOverride: row.manualOverride,
    },
  });

  return NextResponse.json({ ok: true, source, sourceDomain: nextDomain });
}
