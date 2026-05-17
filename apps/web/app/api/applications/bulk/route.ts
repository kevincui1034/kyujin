import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { applicationAudit, applications } from '@kyujin/db/schema';
import { auth } from '@/auth';
import { APPLICATION_STATUSES, type ApplicationStatus } from '@kyujin/shared';
import { apiError } from '@/lib/api-errors';
import { validateBody, z } from '@/lib/with-validated-body';

export const dynamic = 'force-dynamic';

// Hard cap on the size of a single bulk operation. Keeps the audit payload
// bounded and the blast radius of a chat-driven mistake limited; the chat UI
// surfaces this cap when a filter would exceed it.
const BULK_MAX = 100;

const statusBody = z.object({
  ids: z.array(z.string().uuid()).min(1).max(BULK_MAX),
  field: z.literal('status'),
  value: z.enum(APPLICATION_STATUSES as readonly [string, ...string[]]),
});

const notesBody = z.object({
  ids: z.array(z.string().uuid()).min(1).max(BULK_MAX),
  field: z.literal('notes'),
  value: z.string().nullable(),
});

const bodySchema = z.discriminatedUnion('field', [statusBody, notesBody]);

// POST a single field update across many of the caller's applications.
// Body: { ids: string[], field: 'status'|'notes', value: ... }
//
// Behavior:
//   - All ids must belong to the calling user. If any don't, the whole batch
//     is rejected (no partial writes).
//   - company/role bulk updates are intentionally not supported — matchKey
//     collisions are too easy to trigger across N rows in one shot.
//   - Audit row carries every (id, previous, next) so undo restores the full
//     snapshot atomically.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return apiError('unauthenticated');
  const userId = session.user.id;

  const parsed = await validateBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const ids = Array.from(new Set(body.ids));
  const field = body.field;
  const value: string | null = body.value as string | null;

  // Pull all targeted rows up front so we can (a) verify ownership of every
  // id before any write, and (b) snapshot previous values for the audit.
  const rows = await db
    .select()
    .from(applications)
    .where(and(eq(applications.userId, userId), inArray(applications.id, ids)));

  if (rows.length !== ids.length) {
    return apiError('forbidden', {
      message: 'not_found_or_forbidden',
      details: { missing: ids.length - rows.length },
    });
  }

  // Build the changeset. Skip rows where the value is already equal so the
  // audit payload (and the undo) only reflects actual changes.
  const snapshots: Array<{
    id: string;
    previous: string | null;
    previousManualOverride: string | null;
  }> = [];
  for (const r of rows) {
    const current: string | null = field === 'status' ? r.status : r.notes;
    if (current === value) continue;
    snapshots.push({
      id: r.id,
      previous: current,
      previousManualOverride: r.manualOverride,
    });
  }

  if (snapshots.length === 0) {
    return NextResponse.json({ ok: true, unchanged: true, affected: 0 });
  }

  const overrideForField = field;

  await db.transaction(async (tx) => {
    for (const s of snapshots) {
      // manualOverride: union previous list with the bulk-targeted field.
      const previousOverrides = new Set(
        (s.previousManualOverride ?? '').split(',').map((x) => x.trim()).filter(Boolean),
      );
      previousOverrides.add(overrideForField);
      const nextOverride = Array.from(previousOverrides).sort().join(',') || null;

      const update: Record<string, unknown> = {
        manualOverride: nextOverride,
        updatedAt: new Date(),
      };
      if (field === 'status') update.status = value as ApplicationStatus;
      else update.notes = value;

      await tx
        .update(applications)
        .set(update)
        .where(and(eq(applications.userId, userId), eq(applications.id, s.id)));
    }

    await tx.insert(applicationAudit).values({
      userId,
      action: 'bulk_field_update',
      payload: {
        field,
        nextValue: value,
        snapshots,
      },
    });
  });

  return NextResponse.json({ ok: true, affected: snapshots.length });
}
