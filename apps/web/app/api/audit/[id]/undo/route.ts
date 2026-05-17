import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { applicationAudit, applications, emailMessages } from '@kyujin/db/schema';
import { auth } from '@/auth';
import { apiError } from '@/lib/api-errors';
import { enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

interface MergePayload {
  sourceSnapshot: {
    id: string;
    company: string;
    role: string | null;
    sourceDomain: string | null;
    status: 'applied' | 'no_response' | 'interview' | 'rejected' | 'accepted' | 'obtained';
    firstSeenAt: string;
    lastEventAt: string;
    ghostedAt: string | null;
    manualOverride: string | null;
    notes: string | null;
    matchKey: string | null;
  };
  targetSnapshot: {
    id: string;
    status: 'applied' | 'no_response' | 'interview' | 'rejected' | 'accepted' | 'obtained';
    firstSeenAt: string;
    lastEventAt: string;
    matchKey: string | null;
  };
  movedEmailIds: string[];
}

interface MovePayload {
  moved: Array<{ emailId: string; previousApplicationId: string | null }>;
  newApplicationId: string | null;
  allInThread: boolean;
  gmailThreadId: string;
}

interface StatusChangePayload {
  applicationId: string;
  previousStatus: 'applied' | 'no_response' | 'interview' | 'rejected' | 'accepted' | 'obtained';
  newStatus: string;
  previousManualOverride: string | null;
}

interface SourceChangePayload {
  applicationId: string;
  previousSourceDomain: string | null;
  newSourceDomain: string | null;
  newSource: string;
  previousManualOverride: string | null;
}

interface ReorderPayload {
  applicationId: string;
  previousOrders: Array<{ emailId: string; previousDisplayOrder: number | null }>;
  newOrderedEmailIds: string[];
}

type FieldName = 'company' | 'role' | 'status' | 'notes';
type FieldValue = string | null;

interface FieldUpdatePayload {
  applicationId: string;
  changes: Partial<Record<FieldName, { previous: FieldValue; next: FieldValue }>>;
  previousManualOverride: string | null;
  previousMatchKey: string | null;
}

interface BulkFieldUpdatePayload {
  field: 'status' | 'notes';
  nextValue: string | null;
  snapshots: Array<{
    id: string;
    previous: string | null;
    previousManualOverride: string | null;
  }>;
}

// Reverse a previously-logged action. Best-effort: if subsequent operations
// have already modified the rows the undo would touch, the undo still applies
// but may produce surprising state. We surface that risk on the audit page.
// Each audit row can only be undone once (revertedAt is set on first undo).
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return apiError('unauthenticated');
  const userId = session.user.id;
  const { id } = await ctx.params;

  if (!/^[0-9a-f-]{36}$/i.test(id)) return apiError('invalid_params');

  const limited = await enforceRateLimit({ userId, key: 'audit:undo', window: '1m', max: 30 });
  if (limited) return limited;

  const [entry] = await db
    .select()
    .from(applicationAudit)
    .where(and(eq(applicationAudit.userId, userId), eq(applicationAudit.id, id)))
    .limit(1);
  if (!entry) return apiError('not_found');
  if (entry.revertedAt) {
    return apiError('conflict', { message: 'already_reverted' });
  }

  if (entry.action === 'merge') {
    const payload = entry.payload as MergePayload;
    const { sourceSnapshot, targetSnapshot, movedEmailIds } = payload;

    // Recreate the deleted source application from its snapshot. Use the
    // original id so any external references (none today, but defensive)
    // stay valid.
    await db.insert(applications).values({
      id: sourceSnapshot.id,
      userId,
      company: sourceSnapshot.company,
      role: sourceSnapshot.role,
      sourceDomain: sourceSnapshot.sourceDomain,
      status: sourceSnapshot.status,
      firstSeenAt: new Date(sourceSnapshot.firstSeenAt),
      lastEventAt: new Date(sourceSnapshot.lastEventAt),
      ghostedAt: sourceSnapshot.ghostedAt ? new Date(sourceSnapshot.ghostedAt) : null,
      manualOverride: sourceSnapshot.manualOverride,
      notes: sourceSnapshot.notes,
      matchKey: sourceSnapshot.matchKey,
    });

    // Re-point the moved emails back to the source.
    if (movedEmailIds.length > 0) {
      for (const emailId of movedEmailIds) {
        await db
          .update(emailMessages)
          .set({ applicationId: sourceSnapshot.id })
          .where(and(eq(emailMessages.userId, userId), eq(emailMessages.id, emailId)));
      }
    }

    // Roll back the target's aggregate fields to the pre-merge snapshot.
    await db
      .update(applications)
      .set({
        status: targetSnapshot.status,
        firstSeenAt: new Date(targetSnapshot.firstSeenAt),
        lastEventAt: new Date(targetSnapshot.lastEventAt),
        matchKey: targetSnapshot.matchKey,
        updatedAt: new Date(),
      })
      .where(and(eq(applications.userId, userId), eq(applications.id, targetSnapshot.id)));
  } else if (entry.action === 'move_email' || entry.action === 'detach_email') {
    const payload = entry.payload as MovePayload;
    for (const m of payload.moved) {
      await db
        .update(emailMessages)
        .set({ applicationId: m.previousApplicationId })
        .where(and(eq(emailMessages.userId, userId), eq(emailMessages.id, m.emailId)));
    }
  } else if (entry.action === 'status_change') {
    const payload = entry.payload as StatusChangePayload;
    await db
      .update(applications)
      .set({
        status: payload.previousStatus,
        manualOverride: payload.previousManualOverride,
        updatedAt: new Date(),
      })
      .where(and(eq(applications.userId, userId), eq(applications.id, payload.applicationId)));
  } else if (entry.action === 'source_change') {
    const payload = entry.payload as SourceChangePayload;
    await db
      .update(applications)
      .set({
        sourceDomain: payload.previousSourceDomain,
        manualOverride: payload.previousManualOverride,
        updatedAt: new Date(),
      })
      .where(and(eq(applications.userId, userId), eq(applications.id, payload.applicationId)));
  } else if (entry.action === 'reorder_emails') {
    const payload = entry.payload as ReorderPayload;
    for (const p of payload.previousOrders) {
      await db
        .update(emailMessages)
        .set({ displayOrder: p.previousDisplayOrder })
        .where(and(eq(emailMessages.userId, userId), eq(emailMessages.id, p.emailId)));
    }
  } else if (entry.action === 'field_update') {
    const payload = entry.payload as FieldUpdatePayload;
    const restore: Record<string, unknown> = {
      manualOverride: payload.previousManualOverride,
      updatedAt: new Date(),
    };
    if (payload.changes.company) restore.company = payload.changes.company.previous;
    if (payload.changes.role) restore.role = payload.changes.role.previous;
    if (payload.changes.status) restore.status = payload.changes.status.previous;
    if (payload.changes.notes) restore.notes = payload.changes.notes.previous;
    if (payload.changes.company || payload.changes.role) {
      restore.matchKey = payload.previousMatchKey;
    }
    await db
      .update(applications)
      .set(restore)
      .where(
        and(eq(applications.userId, userId), eq(applications.id, payload.applicationId)),
      );
  } else if (entry.action === 'bulk_field_update') {
    const payload = entry.payload as BulkFieldUpdatePayload;
    await db.transaction(async (tx) => {
      for (const s of payload.snapshots) {
        const update: Record<string, unknown> = {
          manualOverride: s.previousManualOverride,
          updatedAt: new Date(),
        };
        if (payload.field === 'status') update.status = s.previous;
        else update.notes = s.previous;
        await tx
          .update(applications)
          .set(update)
          .where(and(eq(applications.userId, userId), eq(applications.id, s.id)));
      }
    });
  } else {
    return apiError('invalid_body', { message: 'unknown_action' });
  }

  await db
    .update(applicationAudit)
    .set({ revertedAt: new Date() })
    .where(eq(applicationAudit.id, entry.id));

  return NextResponse.json({ ok: true });
}
