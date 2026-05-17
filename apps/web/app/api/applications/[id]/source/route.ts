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
import { apiError } from '@/lib/api-errors';
import { validateBody, z } from '@/lib/with-validated-body';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  source: z.enum(APPLICATION_SOURCES as readonly [string, ...string[]]),
});

// Manual source override. The source surfaced on the applications list is
// derived from `source_domain` via getApplicationSource(); we honor the
// user's correction by stamping the canonical domain for that source onto
// the row (or NULL for 'other'). Audit-logged so undo can restore.
// Body: { source: ApplicationSource }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return apiError('unauthenticated');
  const userId = session.user.id;
  const { id } = await ctx.params;

  const parsed = await validateBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const source = parsed.data.source as ApplicationSource;

  const [row] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.userId, userId), eq(applications.id, id)))
    .limit(1);
  if (!row) return apiError('not_found');

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
