'use client';

import Link from 'next/link';
import { useState } from 'react';
import { StatusBadge } from '@/components/status-badge';
import type { AgentAction, AgentAppRow } from '@/lib/agent/tools';

interface PreviewCardProps {
  action: AgentAction;
  candidates?: AgentAppRow[];
  resolvedRows?: AgentAppRow[];
  onApplied: (summary: string) => void;
  onDismiss: () => void;
  onPickCandidate: (row: AgentAppRow) => void;
}

function fieldLabel(f: string): string {
  return f.charAt(0).toUpperCase() + f.slice(1);
}

function describeFilter(f: {
  company?: string;
  status?: string;
  ghostedPastDays?: number;
}): string {
  const parts: string[] = [];
  if (f.company) parts.push(`company ~ "${f.company}"`);
  if (f.status) parts.push(`status = ${f.status}`);
  if (f.ghostedPastDays !== undefined) parts.push(`ghosted past ${f.ghostedPastDays} days`);
  return parts.length ? parts.join(', ') : 'all applications';
}

export function PreviewCard({
  action,
  candidates,
  resolvedRows,
  onApplied,
  onDismiss,
  onPickCandidate,
}: PreviewCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shellStyle: React.CSSProperties = {
    background: 'var(--kyujin-bg-alt)',
    border: '1px solid var(--kyujin-line)',
    borderRadius: 14,
    padding: 11,
    fontSize: 12,
    color: 'var(--kyujin-ink)',
  };

  const confirmBtnStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, var(--kyujin-pink-500), var(--kyujin-coral))',
    boxShadow: '0 3px 8px -4px var(--kyujin-pink-300)',
  };

  const submitUpdate = async (
    applicationId: string,
    field: string,
    value: string | null,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string; existingId?: string | null }
          | null;
        if (data?.error === 'duplicate_match_key' && data.existingId) {
          setError(`Another application with this company/role already exists.`);
          onApplied(
            `There's already an application with that (company, role). Open it: /app/applications/${data.existingId}`,
          );
        } else {
          setError(data?.error ?? 'Update failed.');
        }
        return;
      }
      onApplied(`Done — updated ${field}. Undo from the audit log if needed.`);
    } finally {
      setBusy(false);
    }
  };

  const submitBulk = async (
    ids: string[],
    field: 'status' | 'notes',
    value: string | null,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/applications/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids, field, value }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Bulk update failed.');
        return;
      }
      const data = (await res.json()) as { affected?: number };
      onApplied(
        `Done — updated ${field} on ${data.affected ?? ids.length} application${(data.affected ?? ids.length) === 1 ? '' : 's'}.`,
      );
    } finally {
      setBusy(false);
    }
  };

  if (action.type === 'update_application') {
    const { applicationId, field, value } = action.args;
    return (
      <div style={shellStyle}>
        <div className="mb-2 text-[12px]" style={{ color: 'var(--kyujin-ink)' }}>
          I&apos;ll change <strong>{fieldLabel(field)}</strong> to{' '}
          <strong>&ldquo;{value ?? '—'}&rdquo;</strong>.
        </div>
        {error && (
          <div className="mb-2 text-[11.5px]" style={{ color: '#c25448' }}>
            {error}
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void submitUpdate(applicationId, field, value)}
            className="rounded-md px-3 py-1 text-[11.5px] font-semibold text-white disabled:opacity-40"
            style={confirmBtnStyle}
          >
            Confirm
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDismiss}
            className="rounded-md px-3 py-1 text-[11.5px] font-medium disabled:opacity-40"
            style={{
              border: '1px solid var(--kyujin-line-soft)',
              color: 'var(--kyujin-ink-soft)',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (action.type === 'bulk_update') {
    const rows = resolvedRows ?? [];
    const value = action.args.value;
    if (rows.length === 0) {
      return (
        <div style={shellStyle}>
          <div className="text-[12px]" style={{ color: 'var(--kyujin-ink-soft)' }}>
            No applications match {describeFilter(action.args.filter)} — nothing to do.
          </div>
        </div>
      );
    }
    return (
      <div style={shellStyle}>
        <div className="mb-2 text-[12px]">
          I&apos;ll set <strong>{action.args.field}</strong> to{' '}
          <strong>&ldquo;{value ?? '—'}&rdquo;</strong> on{' '}
          <strong>
            {rows.length} application{rows.length === 1 ? '' : 's'}
          </strong>
          .
        </div>
        <details className="mb-2">
          <summary
            className="cursor-pointer text-[11px]"
            style={{ color: 'var(--kyujin-ink-muted)' }}
          >
            Show targets
          </summary>
          <ul className="mt-1 max-h-32 overflow-y-auto text-[11.5px]">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-0.5">
                <span className="truncate" style={{ color: 'var(--kyujin-ink)' }}>
                  {r.company}
                  {r.role ? ` — ${r.role}` : ''}
                </span>
                <StatusBadge status={r.status} size="sm" />
              </li>
            ))}
          </ul>
        </details>
        {error && (
          <div className="mb-2 text-[11.5px]" style={{ color: '#c25448' }}>
            {error}
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void submitBulk(
                rows.map((r) => r.id),
                action.args.field,
                value,
              )
            }
            className="rounded-md px-3 py-1 text-[11.5px] font-semibold text-white disabled:opacity-40"
            style={confirmBtnStyle}
          >
            Confirm
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDismiss}
            className="rounded-md px-3 py-1 text-[11.5px] font-medium disabled:opacity-40"
            style={{
              border: '1px solid var(--kyujin-line-soft)',
              color: 'var(--kyujin-ink-soft)',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (action.type === 'query_applications') {
    const rows = resolvedRows ?? [];
    return (
      <div style={shellStyle}>
        <div className="mb-2 text-[11px]" style={{ color: 'var(--kyujin-ink-muted)' }}>
          {describeFilter(action.args.filter)} · {rows.length} result
          {rows.length === 1 ? '' : 's'}
        </div>
        {rows.length === 0 ? (
          <div className="text-[12px]" style={{ color: 'var(--kyujin-ink-soft)' }}>
            No matches.
          </div>
        ) : (
          <ul className="max-h-44 overflow-y-auto text-[11.5px]">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-1">
                <Link
                  href={`/app/applications/${r.id}`}
                  className="truncate hover:underline"
                  style={{ color: 'var(--kyujin-ink)' }}
                >
                  {r.company}
                  {r.role ? ` — ${r.role}` : ''}
                </Link>
                <StatusBadge status={r.status} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (action.type === 'clarify') {
    const rows = candidates ?? [];
    return (
      <div style={shellStyle}>
        <div className="mb-2 text-[12px]" style={{ color: 'var(--kyujin-ink)' }}>
          {action.args.question}
        </div>
        {rows.length > 0 && (
          <ul className="flex flex-col gap-1">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onPickCandidate(r)}
                  className="w-full rounded-md px-2 py-1 text-left text-[11.5px] transition-colors hover:bg-kyujin-pink-50"
                  style={{
                    border: '1px solid var(--kyujin-line-soft)',
                    color: 'var(--kyujin-ink)',
                  }}
                >
                  {r.company}
                  {r.role ? ` — ${r.role}` : ''}{' '}
                  <span style={{ color: 'var(--kyujin-ink-muted)' }}>({r.status})</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return null;
}
