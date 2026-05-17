import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { applicationAudit, applications } from '@kyujin/db/schema';
import { auth } from '@/auth';
import { APPLICATION_STATUSES, type ApplicationStatus } from '@kyujin/shared';

export const dynamic = 'force-dynamic';

// Hard cap on the size of a single bulk operation. Keeps the audit payload
// bounded and the blast radius of a chat-driven mistake limited; the chat UI
// surfaces this cap when a filter would exceed it.
const BULK_MAX = 100;

type BulkField = 'status' | 'notes';

interface BulkBody {
  ids?: unknown;
  field?: unknown;
  value?: unknown;
}

function isStatus(v: unknown): v is ApplicationStatus {
  return typeof v === 'string' && (APPLICATION_STATUSES as readonly string[]).includes(v);
}

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
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const userId = session.user.id;

  let body: BulkBody;
  try {
    body = (await req.json()) as BulkBody;
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: 'ids_required' }, { status: 400 });
  }
  if (!body.ids.every((v): v is string => typeof v === 'string')) {
    return NextResponse.json({ error: 'invalid_ids' }, { status: 400 });
  }
  if (body.ids.length > BULK_MAX) {
    return NextResponse.json(
      { error: 'too_many', max: BULK_MAX, received: body.ids.length },
      { status: 400 },
    );
  }
  const ids: string[] = Array.from(new Set(body.ids));

  if (body.field !== 'status' && body.field !== 'notes') {
    return NextResponse.json({ error: 'invalid_field' }, { status: 400 });
  }
  const field: BulkField = body.field;

  let value: string | null;
  if (field === 'status') {
    if (!isStatus(body.value)) {
      return NextResponse.json({ error: 'invalid_value' }, { status: 400 });
    }
    value = body.value;
  } else {
    if (body.value !== null && typeof body.value !== 'string') {
      return NextResponse.json({ error: 'invalid_value' }, { status: 400 });
    }
    value = body.value === null ? null : (body.value as string);
  }

  // Pull all targeted rows up front so we can (a) verify ownership of every
  // id before any write, and (b) snapshot previous values for the audit.
  const rows = await db
    .select()
    .from(applications)
    .where(and(eq(applications.userId, userId), inArray(applications.id, ids)));

  if (rows.length !== ids.length) {
    return NextResponse.json(
      { error: 'not_found_or_forbidden', missing: ids.length - rows.length },
      { status: 403 },
    );
  }

  // Build the changeset. Skip rows where the value is already equal so the
  // audit payload (and the undo) only reflects actual changes.
  const snapshots: Array<{
    id: string;
    previous: string | null;
    previousManualOverride: string | null;
  }> = [];
  for (const r of rows) {
    const current = field === 'status' ? r.status : r.notes;
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
      if (field === 'status') update.status = value;
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
