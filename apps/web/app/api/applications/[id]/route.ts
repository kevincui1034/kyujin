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
import { apiError } from '@/lib/api-errors';
import { validateBody, z } from '@/lib/with-validated-body';
import { enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

type FieldName = 'company' | 'role' | 'status' | 'notes';
type FieldValue = string | null;

// Each field is optional; absence means "don't touch." `null` on role/notes
// clears the column; null is not accepted on company (column is NOT NULL).
const bodySchema = z
  .object({
    company: z.string().min(1).optional(),
    role: z.string().nullable().optional(),
    status: z.enum(APPLICATION_STATUSES as readonly [string, ...string[]]).optional(),
    notes: z.string().nullable().optional(),
  })
  .strict();

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
  if (!session?.user?.id) return apiError('unauthenticated');
  const userId = session.user.id;
  const { id } = await ctx.params;

  // Shared bucket across every applications/[id]/* write endpoint so the
  // 60/min budget can't be doubled by alternating between routes.
  const limited = await enforceRateLimit({ userId, key: 'applications:write', window: '1m', max: 60 });
  if (limited) return limited;

  const parsed = await validateBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Normalize trimmable fields. Schema already enforces types; trim happens
  // here so the validator stays declarative.
  const proposed: Partial<Record<FieldName, FieldValue>> = {};
  if (body.company !== undefined) {
    const trimmed = body.company.trim();
    if (trimmed.length === 0) {
      return apiError('invalid_body', { message: 'invalid_company' });
    }
    proposed.company = trimmed;
  }
  if (body.role !== undefined) {
    proposed.role = body.role === null ? null : body.role.trim() || null;
  }
  if (body.status !== undefined) {
    proposed.status = body.status as ApplicationStatus;
  }
  if (body.notes !== undefined) {
    proposed.notes = body.notes;
  }

  if (Object.keys(proposed).length === 0) {
    return apiError('invalid_body', { message: 'no_fields' });
  }

  const [row] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.userId, userId), eq(applications.id, id)))
    .limit(1);
  if (!row) return apiError('not_found');

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
      return apiError('conflict', {
        message: 'duplicate_match_key',
        details: { existingId: existing?.id ?? null },
      });
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
