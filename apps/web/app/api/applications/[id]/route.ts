import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { applicationAudit, applications } from '@kyujin/db/schema';
import { auth } from '@/auth';
import {
  APPLICATION_STATUSES,
  buildMatchKey,
  type ApplicationStatus,
} from '@kyujin/shared';

export const dynamic = 'force-dynamic';

type FieldName = 'company' | 'role' | 'status' | 'notes';
type FieldValue = string | null;

interface PatchBody {
  company?: unknown;
  role?: unknown;
  status?: unknown;
  notes?: unknown;
}

function isStatus(v: unknown): v is ApplicationStatus {
  return typeof v === 'string' && (APPLICATION_STATUSES as readonly string[]).includes(v);
}

function isPgUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505'
  );
}

// PATCH a single application's user-editable fields. Fields can be sent
// individually or together: { company?, role?, status?, notes? }.
//
// Behavior:
//   - Only fields whose value differs from current are written.
//   - `manualOverride` is updated to a union of previously-overridden fields
//     and the newly-changed ones, so the classifier respects every user edit.
//   - When `company` or `role` changes, `matchKey` is recomputed. A
//     unique-constraint collision returns 409 with the existing id so the
//     caller can offer a merge.
//   - Status-only changes write a `status_change` audit row matching the
//     shape of /api/applications/[id]/status so the existing undo branch
//     continues to work unchanged.
//   - Any change that touches company/role/notes (with or without status)
//     writes a `field_update` audit row capturing every previous/next pair.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await ctx.params;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  // Validate types per field. Company must be a non-empty string when present
  // (NOT NULL in schema). Role and notes accept null to clear them.
  const proposed: Partial<Record<FieldName, FieldValue>> = {};
  if ('company' in body) {
    if (typeof body.company !== 'string' || body.company.trim().length === 0) {
      return NextResponse.json({ error: 'invalid_company' }, { status: 400 });
    }
    proposed.company = body.company.trim();
  }
  if ('role' in body) {
    if (body.role !== null && typeof body.role !== 'string') {
      return NextResponse.json({ error: 'invalid_role' }, { status: 400 });
    }
    proposed.role = body.role === null ? null : (body.role as string).trim() || null;
  }
  if ('status' in body) {
    if (!isStatus(body.status)) {
      return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
    }
    proposed.status = body.status;
  }
  if ('notes' in body) {
    if (body.notes !== null && typeof body.notes !== 'string') {
      return NextResponse.json({ error: 'invalid_notes' }, { status: 400 });
    }
    proposed.notes = body.notes === null ? null : (body.notes as string);
  }

  if (Object.keys(proposed).length === 0) {
    return NextResponse.json({ error: 'no_fields' }, { status: 400 });
  }

  const [row] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.userId, userId), eq(applications.id, id)))
    .limit(1);
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Diff: only act on fields whose values actually change.
  const changes: Partial<Record<FieldName, { previous: FieldValue; next: FieldValue }>> = {};
  if (proposed.company !== undefined && proposed.company !== row.company) {
    changes.company = { previous: row.company, next: proposed.company };
  }
  if (proposed.role !== undefined && proposed.role !== row.role) {
    changes.role = { previous: row.role, next: proposed.role };
  }
  if (proposed.status !== undefined && proposed.status !== row.status) {
    changes.status = { previous: row.status, next: proposed.status };
  }
  if (proposed.notes !== undefined && proposed.notes !== row.notes) {
    changes.notes = { previous: row.notes, next: proposed.notes };
  }

  const changedFields = Object.keys(changes) as FieldName[];
  if (changedFields.length === 0) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const nextCompany = changes.company ? (changes.company.next as string) : row.company;
  const nextRole = changes.role ? (changes.role.next as string | null) : row.role;
  const matchKeyWillChange = !!changes.company || !!changes.role;
  const nextMatchKey = matchKeyWillChange ? buildMatchKey(nextCompany, nextRole) : row.matchKey;

  // manualOverride is a comma-joined union of fields the user has edited
  // manually. The classifier never downgrades these.
  const previousOverrides = new Set(
    (row.manualOverride ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  );
  for (const f of changedFields) previousOverrides.add(f);
  const nextOverride = Array.from(previousOverrides).sort().join(',') || null;

  // Status-only change → preserve the existing /status route's audit shape so
  // the audit undo branch for `status_change` keeps working unchanged. The
  // existing route also sets manualOverride to literal 'status' — we match
  // that exactly when nothing else changes.
  const isStatusOnly = changedFields.length === 1 && changedFields[0] === 'status';

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (changes.company) updates.company = changes.company.next;
  if (changes.role) updates.role = changes.role.next;
  if (changes.status) updates.status = changes.status.next;
  if (changes.notes) updates.notes = changes.notes.next;
  if (matchKeyWillChange) updates.matchKey = nextMatchKey;
  updates.manualOverride = isStatusOnly ? 'status' : nextOverride;

  try {
    await db
      .update(applications)
      .set(updates)
      .where(and(eq(applications.userId, userId), eq(applications.id, id)));
  } catch (err) {
    if (isPgUniqueViolation(err) && matchKeyWillChange) {
      const [existing] = await db
        .select({ id: applications.id })
        .from(applications)
        .where(and(eq(applications.userId, userId), eq(applications.matchKey, nextMatchKey!)))
        .limit(1);
      return NextResponse.json(
        { error: 'duplicate_match_key', existingId: existing?.id ?? null },
        { status: 409 },
      );
    }
    throw err;
  }

  if (isStatusOnly) {
    await db.insert(applicationAudit).values({
      userId,
      action: 'status_change',
      payload: {
        applicationId: id,
        previousStatus: row.status,
        newStatus: changes.status!.next,
        previousManualOverride: row.manualOverride,
      },
    });
  } else {
    await db.insert(applicationAudit).values({
      userId,
      action: 'field_update',
      payload: {
        applicationId: id,
        changes,
        previousManualOverride: row.manualOverride,
        previousMatchKey: row.matchKey,
      },
    });
  }

  return NextResponse.json({ ok: true, changed: changedFields });
}
