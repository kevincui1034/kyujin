'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Loader2, Plus, Trash2, X } from 'lucide-react';
import type { TodoJob } from '@kyujin/db/schema';
import { CompanyAvatar } from '@/components/kyujin/company-avatar';
import { PillowCard } from '@/components/kyujin/pillow-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatRelative } from '@/lib/utils';

interface Props {
  initial: TodoJob[];
}

export function TodosClient({ initial }: Props) {
  const [todos, setTodos] = useState<TodoJob[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const [url, setUrl] = useState('');
  const [draftCompany, setDraftCompany] = useState('');
  const [draftPosition, setDraftPosition] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const selected = useMemo(
    () => todos.find((t) => t.id === selectedId) ?? null,
    [todos, selectedId],
  );

  const canSubmit =
    url.trim().length > 0 ||
    draftCompany.trim().length > 0 ||
    draftPosition.trim().length > 0;

  const handleAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmedUrl = url.trim();
      const trimmedCompany = draftCompany.trim();
      const trimmedPosition = draftPosition.trim();
      if (!trimmedUrl && !trimmedCompany && !trimmedPosition) return;
      setAdding(true);
      setAddError(null);
      try {
        const res = await fetch('/api/todos', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            url: trimmedUrl || null,
            company: trimmedCompany || null,
            position: trimmedPosition || null,
          }),
        });
        const json = (await res.json().catch(() => null)) as
          | { todo: TodoJob; existed?: boolean }
          | { error: string; message?: string }
          | null;
        if (!res.ok || !json || !('todo' in json)) {
          const msg =
            (json && 'message' in json && json.message) ||
            (json && 'error' in json && json.error) ||
            'Could not save that job.';
          setAddError(humanizeError(typeof msg === 'string' ? msg : null));
          return;
        }
        setTodos((prev) => {
          if (json.existed) {
            return prev.map((t) => (t.id === json.todo.id ? json.todo : t));
          }
          return [json.todo, ...prev];
        });
        setSelectedId(json.todo.id);
        setUrl('');
        setDraftCompany('');
        setDraftPosition('');
      } finally {
        setAdding(false);
      }
    },
    [url, draftCompany, draftPosition],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const ok = confirm('Remove this saved job?');
      if (!ok) return;
      setTodos((prev) => prev.filter((t) => t.id !== id));
      if (selectedId === id) setSelectedId(null);
      const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        // Surfacing this to the user is overkill — refetch silently to put it
        // back if the server rejected the delete (very rare path).
        try {
          const list = await fetch('/api/todos').then((r) => r.json());
          if (Array.isArray(list?.todos)) setTodos(list.todos);
        } catch {
          // ignore
        }
      }
    },
    [selectedId],
  );

  const handleFieldUpdate = useCallback(
    async (id: string, patch: Partial<Pick<TodoJob, 'company' | 'position' | 'notes'>>) => {
      // Optimistic — write to local state first, fire the PATCH in the background.
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? ({ ...t, ...patch } as TodoJob) : t)),
      );
      try {
        await fetch(`/api/todos/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
      } catch {
        // Network failures are silent — Drizzle hasn't lost data because the
        // server never saw it; the next reload restores the canonical value.
      }
    },
    [],
  );

  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(0, 1fr) 360px' }}>
      <div className="flex flex-col gap-4">
        <PillowCard padding="14px 16px">
          <form onSubmit={handleAdd} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Input
                type="url"
                inputMode="url"
                placeholder="Paste a job link — https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={adding}
                className="h-10 flex-1"
                aria-label="Job posting URL"
              />
              <Button
                type="submit"
                disabled={adding || !canSubmit}
                className="h-10 gap-1.5 rounded-full px-4 text-[13px] font-semibold text-white"
                style={{
                  background: 'var(--kyujin-pink-500)',
                  boxShadow:
                    '0 14px 26px -10px rgba(232,90,122,0.6), inset 0 1px 0 rgba(255,255,255,0.25)',
                }}
              >
                {adding ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving…</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    <span>Save job</span>
                  </>
                )}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Company (optional)"
                value={draftCompany}
                onChange={(e) => setDraftCompany(e.target.value)}
                disabled={adding}
                className="h-9 flex-1"
                aria-label="Company"
              />
              <Input
                placeholder="Position (optional)"
                value={draftPosition}
                onChange={(e) => setDraftPosition(e.target.value)}
                disabled={adding}
                className="h-9 flex-1"
                aria-label="Position"
              />
            </div>
            {addError && (
              <div className="text-[12px]" style={{ color: 'var(--kyujin-coral-deep, #c0392b)' }}>
                {addError}
              </div>
            )}
            <div className="text-[11.5px]" style={{ color: 'var(--kyujin-ink-muted)' }}>
              Paste a link, type the details yourself, or both. With a link we&apos;ll try to fill in
              the company and position from the page.
            </div>
          </form>
        </PillowCard>

        {todos.length === 0 ? (
          <PillowCard>
            <div className="py-8 text-center text-[13px]" style={{ color: 'var(--kyujin-ink-soft)' }}>
              No saved jobs yet. Paste a link above to start your shortlist.
            </div>
          </PillowCard>
        ) : (
          <PillowCard padding="8px 12px">
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ color: 'var(--kyujin-ink-muted)' }}>
                  <ColHeader>Company</ColHeader>
                  <ColHeader>Position</ColHeader>
                  <ColHeader>Status</ColHeader>
                  <ColHeader>Saved</ColHeader>
                  <th className="w-[60px]" />
                </tr>
              </thead>
              <tbody>
                {todos.map((t, i) => (
                  <tr
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className="cursor-pointer transition-colors hover:bg-kyujin-pink-50"
                    style={{
                      borderTop: i === 0 ? 'none' : '1px solid var(--kyujin-line-faint)',
                      background:
                        selectedId === t.id ? 'rgba(232,90,122,0.06)' : undefined,
                    }}
                  >
                    <td className="px-3 py-3 font-medium" style={{ color: 'var(--kyujin-ink)' }}>
                      <div className="flex items-center gap-2.5">
                        <CompanyAvatar company={displayCompany(t)} size={24} />
                        <span className="flex flex-col">
                          <span>{displayCompany(t)}</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3" style={{ color: 'var(--kyujin-ink-soft)' }}>
                      {t.position ?? '—'}
                    </td>
                    <td className="px-3 py-3">
                      <InProgressBadge />
                    </td>
                    <td className="px-3 py-3" style={{ color: 'var(--kyujin-ink-soft)' }}>
                      {formatRelative(t.createdAt)}
                    </td>
                    <td className="px-1 py-3 text-right">
                      {t.url ? (
                        <a
                          href={t.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Open job link"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-kyujin-ink-muted transition-colors hover:bg-kyujin-pink-50 hover:text-kyujin-pink-700"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PillowCard>
        )}
      </div>

      <NotesPanel
        todo={selected}
        onDeselect={() => setSelectedId(null)}
        onChange={(patch) => selected && handleFieldUpdate(selected.id, patch)}
        onDelete={() => selected && handleDelete(selected.id)}
      />
    </div>
  );
}

function ColHeader({ children }: { children: React.ReactNode }) {
  return (
    <th
      className="px-3 py-3 text-left font-semibold"
      style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}
    >
      {children}
    </th>
  );
}

function InProgressBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{
        background: 'rgba(168,122,42,0.10)',
        color: 'var(--kyujin-butter-deep, #a87a2a)',
        border: '1px solid rgba(168,122,42,0.22)',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--kyujin-butter-deep, #a87a2a)',
        }}
      />
      In Progress
    </span>
  );
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function displayCompany(t: TodoJob): string {
  if (t.company) return t.company;
  if (t.url) return hostnameOf(t.url) ?? 'Untitled';
  if (t.position) return t.position;
  return 'Untitled';
}

function humanizeError(message: string | null): string {
  if (message === 'need_url_or_details') {
    return 'Add a link, a company, or a position before saving.';
  }
  if (message === 'url_must_be_http') {
    return 'Links need to start with http:// or https://.';
  }
  return message ?? 'Could not save that job.';
}

interface NotesPanelProps {
  todo: TodoJob | null;
  onDeselect: () => void;
  onChange: (patch: Partial<Pick<TodoJob, 'company' | 'position' | 'notes'>>) => void;
  onDelete: () => void;
}

function NotesPanel({ todo, onDeselect, onChange, onDelete }: NotesPanelProps) {
  // Local mirror so typing feels instant and we can debounce the PATCH instead
  // of firing one per keystroke.
  const [company, setCompany] = useState(todo?.company ?? '');
  const [position, setPosition] = useState(todo?.position ?? '');
  const [notes, setNotes] = useState(todo?.notes ?? '');
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    // When the selected row changes, reset local state from the new todo so
    // we don't leak the previous row's edits into the new panel.
    if (todo?.id !== lastIdRef.current) {
      lastIdRef.current = todo?.id ?? null;
      setCompany(todo?.company ?? '');
      setPosition(todo?.position ?? '');
      setNotes(todo?.notes ?? '');
    }
  }, [todo]);

  // Debounced auto-save: 500ms after the last keystroke, flush whatever
  // differs from the canonical row.
  useEffect(() => {
    if (!todo) return;
    const handle = setTimeout(() => {
      const patch: Partial<Pick<TodoJob, 'company' | 'position' | 'notes'>> = {};
      const trimmedCompany = company.trim();
      const trimmedPosition = position.trim();
      if ((trimmedCompany || null) !== (todo.company ?? null)) {
        patch.company = trimmedCompany || null;
      }
      if ((trimmedPosition || null) !== (todo.position ?? null)) {
        patch.position = trimmedPosition || null;
      }
      if (notes !== (todo.notes ?? '')) {
        patch.notes = notes;
      }
      if (Object.keys(patch).length > 0) onChange(patch);
    }, 500);
    return () => clearTimeout(handle);
    // onChange is stable enough; we depend on the user-visible fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, position, notes, todo?.id]);

  if (!todo) {
    return (
      <PillowCard
        tone="pink"
        padding="20px"
        className="flex h-full min-h-[400px] flex-col items-center justify-center text-center"
      >
        <div
          className="serif"
          style={{ fontSize: 20, color: 'var(--kyujin-ink)', letterSpacing: '-0.02em' }}
        >
          Pick a job to
          <br />
          <span className="serif-italic" style={{ color: 'var(--kyujin-pink-500)' }}>
            jot a thought.
          </span>
        </div>
        <p
          className="mt-3"
          style={{ fontSize: 12.5, color: 'var(--kyujin-ink-soft)', maxWidth: 240, lineHeight: 1.5 }}
        >
          Click any row on the left to edit its company, position, and notes.
        </p>
      </PillowCard>
    );
  }

  return (
    <PillowCard padding="18px 20px" className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="eyebrow" style={{ color: 'var(--kyujin-pink-600)' }}>
            SAVED {formatRelative(todo.createdAt).toUpperCase()}
          </div>
          {todo.url ? (
            <a
              href={todo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block truncate text-[12px] hover:underline"
              style={{ color: 'var(--kyujin-ink-muted)' }}
              title={todo.url}
            >
              {todo.url}
            </a>
          ) : (
            <span
              className="mt-1 block text-[12px] italic"
              style={{ color: 'var(--kyujin-ink-muted)' }}
            >
              No link — added manually
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onDeselect}
          aria-label="Close panel"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-kyujin-ink-muted transition-colors hover:bg-kyujin-pink-50 hover:text-kyujin-pink-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        <Field label="Company">
          <Input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Acme Inc."
            className="h-9"
          />
        </Field>
        <Field label="Position">
          <Input
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="Senior Engineer"
            className="h-9"
          />
        </Field>
        <Field label="Notes">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything you want to remember about this one — recruiter name, salary band, why it caught your eye…"
            className="min-h-[180px] resize-y"
          />
        </Field>
      </div>

      <div className="mt-1 flex items-center justify-between border-t pt-3" style={{ borderColor: 'var(--kyujin-line-faint)' }}>
        <span className="text-[11px]" style={{ color: 'var(--kyujin-ink-muted)' }}>
          Auto-saves as you type
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors hover:bg-kyujin-pink-50"
          style={{ color: 'var(--kyujin-ink-muted)' }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove
        </button>
      </div>
    </PillowCard>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span
        className="eyebrow"
        style={{ color: 'var(--kyujin-ink-muted)', fontSize: 10.5 }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
