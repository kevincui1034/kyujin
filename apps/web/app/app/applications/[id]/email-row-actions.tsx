'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface OtherApp {
  id: string;
  company: string;
  role: string | null;
}

interface Props {
  emailId: string;
  currentApplicationId: string;
  // How many sibling emails (including this one) point at the current
  // application AND share the same Gmail thread. When > 1 we expose the
  // "move all in thread" checkbox.
  threadSiblingCount: number;
  otherApps: OtherApp[];
}

type Mode = 'idle' | 'choose';

export function EmailRowActions({
  emailId,
  currentApplicationId,
  threadSiblingCount,
  otherApps,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('idle');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string>('');
  const [filter, setFilter] = useState('');
  const [allInThread, setAllInThread] = useState(false);

  function reset() {
    setMode('idle');
    setError(null);
    setTargetId('');
    setFilter('');
    setAllInThread(false);
  }

  async function move(applicationId: string | null) {
    setError(null);
    const res = await fetch(`/api/emails/${emailId}/move`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ applicationId, allInThread }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? `Move failed (${res.status})`);
      return;
    }
    reset();
    startTransition(() => router.refresh());
  }

  if (mode === 'idle') {
    return (
      <button
        type="button"
        onClick={() => setMode('choose')}
        className="text-[10.5px] font-medium text-kyujin-ink-muted underline-offset-2 transition-colors hover:text-kyujin-pink-700 hover:underline"
      >
        Move / detach
      </button>
    );
  }

  const filtered = otherApps.filter((a) => {
    if (a.id === currentApplicationId) return false;
    if (!filter.trim()) return true;
    const needle = filter.trim().toLowerCase();
    return (
      a.company.toLowerCase().includes(needle) ||
      (a.role ?? '').toLowerCase().includes(needle)
    );
  });

  return (
    <div className="mt-2 rounded border bg-background p-2 text-[12px]">
      <Input
        placeholder="Move to application — search…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="h-8 text-[12px]"
      />
      <div className="max-h-40 overflow-auto rounded border bg-muted/30 mt-1.5">
        {filtered.length === 0 ? (
          <div className="p-2 text-[11px] text-muted-foreground">No matches.</div>
        ) : (
          filtered.map((a) => (
            <label
              key={a.id}
              className={`flex cursor-pointer items-center gap-2 border-b px-2 py-1 text-[11.5px] last:border-b-0 ${
                targetId === a.id ? 'bg-kyujin-pink-50' : ''
              }`}
            >
              <input
                type="radio"
                name={`move-target-${emailId}`}
                value={a.id}
                checked={targetId === a.id}
                onChange={() => setTargetId(a.id)}
              />
              <span className="font-medium">{a.company}</span>
              {a.role && <span className="text-muted-foreground">— {a.role}</span>}
            </label>
          ))
        )}
      </div>
      {threadSiblingCount > 1 && (
        <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-kyujin-ink-soft">
          <input
            type="checkbox"
            checked={allInThread}
            onChange={(e) => setAllInThread(e.target.checked)}
          />
          Move all {threadSiblingCount} emails in this Gmail thread
        </label>
      )}
      {error && <div className="mt-1 text-[11px] text-destructive">{error}</div>}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Button
          size="sm"
          disabled={pending || !targetId}
          onClick={() => targetId && move(targetId)}
          className="h-7 text-[11px]"
        >
          Move
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => move(null)}
          className="h-7 text-[11px]"
          title="Unlink from this application (sets applicationId = null)"
        >
          Detach
        </Button>
        <Button size="sm" variant="ghost" onClick={reset} className="h-7 text-[11px]">
          Cancel
        </Button>
      </div>
    </div>
  );
}
