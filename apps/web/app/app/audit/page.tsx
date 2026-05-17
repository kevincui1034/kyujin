import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@kyujin/db/client';
import { applicationAudit } from '@kyujin/db/schema';
import { Eyebrow } from '@/components/kyujin/eyebrow';
import { PillowCard } from '@/components/kyujin/pillow-card';
import { UndoButton } from './undo-button';
import { formatRelative } from '@/lib/utils';

interface MergePayload {
  sourceSnapshot: { id: string; company: string; role: string | null };
  targetSnapshot: { id: string };
  movedEmailIds: string[];
}
interface MovePayload {
  moved: Array<{ emailId: string; previousApplicationId: string | null }>;
  newApplicationId: string | null;
  allInThread: boolean;
}
interface StatusChangePayload {
  previousStatus: string;
  newStatus: string;
}
interface SourceChangePayload {
  previousSourceDomain: string | null;
  newSourceDomain: string | null;
  newSource: string;
}
interface ReorderPayload {
  newOrderedEmailIds: string[];
}
interface FieldUpdatePayload {
  applicationId: string;
  changes: Partial<
    Record<
      'company' | 'role' | 'status' | 'notes',
      { previous: string | null; next: string | null }
    >
  >;
}
interface BulkFieldUpdatePayload {
  field: 'status' | 'notes';
  nextValue: string | null;
  snapshots: Array<{ id: string }>;
}

function describe(action: string, payload: unknown): string {
  if (action === 'merge') {
    const p = payload as MergePayload;
    const role = p.sourceSnapshot.role ? ` — ${p.sourceSnapshot.role}` : '';
    return `Merged "${p.sourceSnapshot.company}${role}" (${p.movedEmailIds.length} email${p.movedEmailIds.length === 1 ? '' : 's'}) into another application`;
  }
  if (action === 'move_email') {
    const p = payload as MovePayload;
    const n = p.moved.length;
    if (p.allInThread && n > 1) {
      return `Moved ${n} thread emails to a different application`;
    }
    return `Moved ${n} email${n === 1 ? '' : 's'} to a different application`;
  }
  if (action === 'detach_email') {
    const p = payload as MovePayload;
    const n = p.moved.length;
    return `Detached ${n} email${n === 1 ? '' : 's'} from their application`;
  }
  if (action === 'status_change') {
    const p = payload as StatusChangePayload;
    return `Changed status: ${p.previousStatus} → ${p.newStatus}`;
  }
  if (action === 'source_change') {
    const p = payload as SourceChangePayload;
    const prev = p.previousSourceDomain ?? 'other';
    return `Changed source: ${prev} → ${p.newSource}`;
  }
  if (action === 'reorder_emails') {
    const p = payload as ReorderPayload;
    return `Reordered ${p.newOrderedEmailIds.length} timeline emails`;
  }
  if (action === 'field_update') {
    const p = payload as FieldUpdatePayload;
    const parts: string[] = [];
    for (const [field, change] of Object.entries(p.changes)) {
      if (!change) continue;
      const prev = change.previous ?? '—';
      const next = change.next ?? '—';
      parts.push(`${field}: "${prev}" → "${next}"`);
    }
    return `Edited application — ${parts.join(', ')}`;
  }
  if (action === 'bulk_field_update') {
    const p = payload as BulkFieldUpdatePayload;
    const n = p.snapshots.length;
    const value = p.nextValue ?? '—';
    return `Bulk: set ${p.field} to "${value}" on ${n} application${n === 1 ? '' : 's'}`;
  }
  return action;
}

export default async function AuditPage() {
  const session = await auth();
  const userId = session!.user.id;
  const entries = await db
    .select()
    .from(applicationAudit)
    .where(eq(applicationAudit.userId, userId))
    .orderBy(desc(applicationAudit.createdAt))
    .limit(100);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/app/applications"
          className="text-[12px] font-medium text-kyujin-ink-muted transition-colors hover:text-kyujin-pink-700"
        >
          ← All applications
        </Link>
      </div>

      <div>
        <Eyebrow color="var(--kyujin-pink-600)">AUDIT LOG</Eyebrow>
        <h1
          className="serif mt-1"
          style={{
            fontSize: 36,
            lineHeight: 1.05,
            letterSpacing: '-0.024em',
            color: 'var(--kyujin-ink)',
          }}
        >
          Recent actions
        </h1>
        <p className="mt-1 text-[13px]" style={{ color: 'var(--kyujin-ink-soft)' }}>
          Manual merges, moves, and detaches. Each entry can be undone once. Recent changes elsewhere
          may produce surprising state after an undo — older entries are riskier to revert.
        </p>
      </div>

      {entries.length === 0 ? (
        <PillowCard>
          <div
            className="py-6 text-center text-[13px]"
            style={{ color: 'var(--kyujin-ink-soft)' }}
          >
            No recorded actions yet. Manual merges or email moves will show up here.
          </div>
        </PillowCard>
      ) : (
        <PillowCard padding="8px 12px">
          <ul className="divide-y">
            {entries.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium" style={{ color: 'var(--kyujin-ink)' }}>
                    {describe(e.action, e.payload)}
                  </div>
                  <div className="mt-0.5 text-[11px]" style={{ color: 'var(--kyujin-ink-muted)' }}>
                    {formatRelative(e.createdAt)}
                    {e.revertedAt && (
                      <>
                        {' · '}
                        <span className="font-medium">undone</span> {formatRelative(e.revertedAt)}
                      </>
                    )}
                  </div>
                </div>
                {e.revertedAt ? (
                  <span className="text-[11px]" style={{ color: 'var(--kyujin-ink-muted)' }}>
                    Undone
                  </span>
                ) : (
                  <UndoButton entryId={e.id} />
                )}
              </li>
            ))}
          </ul>
        </PillowCard>
      )}
    </div>
  );
}
