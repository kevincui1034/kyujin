'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Compact shape of every other application owned by the user. Carries enough
// metadata for the picker to preview the target (status, dates, email count)
// when the user is deciding what to merge into.
export interface MergePickerApp {
  id: string;
  company: string;
  role: string | null;
  status: string;
  lastEventAt: string;
  firstSeenAt: string;
  emailCount: number;
  sourceDomain: string | null;
}

interface Props {
  applicationId: string;
  otherApps: MergePickerApp[];
}

const STATUS_LABEL: Record<string, string> = {
  applied: 'Applied',
  no_response: 'No answer',
  interview: 'Interview',
  rejected: 'Rejected',
  accepted: 'Offer',
  obtained: 'Accepted',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ApplicationManageControls({ applicationId, otherApps }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>('');
  const [mergeFilter, setMergeFilter] = useState('');

  function reset() {
    setOpen(false);
    setError(null);
    setMergeTargetId('');
    setMergeFilter('');
  }

  async function submitMerge() {
    setError(null);
    if (!mergeTargetId) {
      setError('Pick a target application');
      return;
    }
    const res = await fetch(`/api/applications/${applicationId}/merge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ intoId: mergeTargetId }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? `Merge failed (${res.status})`);
      return;
    }
    router.push(`/app/applications/${mergeTargetId}`);
  }

  const filtered = useMemo(() => {
    if (!mergeFilter.trim()) return otherApps;
    const needle = mergeFilter.trim().toLowerCase();
    return otherApps.filter(
      (a) =>
        a.company.toLowerCase().includes(needle) ||
        (a.role ?? '').toLowerCase().includes(needle),
    );
  }, [otherApps, mergeFilter]);

  const selected = useMemo(
    () => otherApps.find((a) => a.id === mergeTargetId) ?? null,
    [otherApps, mergeTargetId],
  );

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Merge into…
        </Button>
        <a
          href="/app/audit"
          className="text-[12px] font-medium text-kyujin-ink-muted underline-offset-2 transition-colors hover:text-kyujin-pink-700 hover:underline"
        >
          Audit log →
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-background p-3 space-y-2">
      <div className="text-xs font-medium text-muted-foreground">
        Merge this application into another. Emails will move; this application will be deleted.
        Use the audit log to undo.
      </div>
      <Input
        placeholder="Search by company or role…"
        value={mergeFilter}
        onChange={(e) => setMergeFilter(e.target.value)}
        className="h-9"
      />
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_220px]">
        <div className="max-h-56 overflow-auto rounded border bg-muted/30">
          {filtered.length === 0 ? (
            <div className="p-2 text-xs text-muted-foreground">No matching applications.</div>
          ) : (
            filtered.map((a) => (
              <label
                key={a.id}
                className={`flex cursor-pointer items-center gap-2 border-b px-2 py-1.5 text-xs last:border-b-0 ${
                  mergeTargetId === a.id ? 'bg-kyujin-pink-50' : ''
                }`}
              >
                <input
                  type="radio"
                  name="merge-target"
                  value={a.id}
                  checked={mergeTargetId === a.id}
                  onChange={() => setMergeTargetId(a.id)}
                />
                <span className="font-medium">{a.company}</span>
                {a.role && <span className="text-muted-foreground">— {a.role}</span>}
              </label>
            ))
          )}
        </div>
        <div className="rounded border bg-muted/20 p-2 text-[11.5px]">
          {selected ? (
            <div className="space-y-1">
              <div className="font-semibold text-kyujin-ink">{selected.company}</div>
              {selected.role && (
                <div className="text-muted-foreground">{selected.role}</div>
              )}
              <div className="pt-1.5 text-kyujin-ink-muted">
                <div>
                  Status: <span className="font-medium">{STATUS_LABEL[selected.status] ?? selected.status}</span>
                </div>
                <div>
                  Emails: <span className="font-medium">{selected.emailCount}</span>
                </div>
                <div>First seen: {formatDate(selected.firstSeenAt)}</div>
                <div>Last event: {formatDate(selected.lastEventAt)}</div>
                {selected.sourceDomain && (
                  <div>
                    Source: <span className="font-mono text-[10px]">{selected.sourceDomain}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">Select an application to preview.</div>
          )}
        </div>
      </div>
      {error && <div className="text-xs text-destructive">{error}</div>}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="destructive"
          disabled={pending || !mergeTargetId}
          onClick={submitMerge}
        >
          Confirm merge
        </Button>
        <Button size="sm" variant="ghost" onClick={reset}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
