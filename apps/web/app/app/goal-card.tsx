'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eyebrow } from '@/components/yume/eyebrow';
import { PillowCard } from '@/components/yume/pillow-card';

interface Props {
  total: number;
  goal: number;
}

const MIN_GOAL = 1;
const MAX_GOAL = 9999;

export function GoalCard({ total, goal }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(goal));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  const pct = Math.min(100, Math.round((total / Math.max(1, goal)) * 100));

  async function save() {
    const parsed = parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < MIN_GOAL || parsed > MAX_GOAL) {
      setError(`Pick a whole number between ${MIN_GOAL} and ${MAX_GOAL}.`);
      return;
    }
    setError(null);
    setSaving(true);
    const res = await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ applicationGoal: parsed }),
    });
    setSaving(false);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { hint?: string; error?: string };
      setError(json.hint ?? json.error ?? 'Failed to save.');
      return;
    }
    setEditing(false);
    startTransition(() => router.refresh());
  }

  function cancel() {
    setValue(String(goal));
    setError(null);
    setEditing(false);
  }

  return (
    <PillowCard span={4} tone="coral">
      <div className="flex items-center justify-between">
        <Eyebrow color="rgba(255,255,255,0.85)">CURRENT GOAL</Eyebrow>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setValue(String(goal));
              setEditing(true);
            }}
            className="mono rounded-full px-2 py-0.5"
            style={{
              fontSize: 10.5,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: 'rgba(255,255,255,0.18)',
              color: '#fff',
            }}
          >
            Edit
          </button>
        )}
      </div>
      <div
        className="serif mt-1.5"
        style={{ fontSize: 26, lineHeight: 1.1, letterSpacing: '-0.022em' }}
      >
        <span className="serif-italic">finish</span> the search.
      </div>
      <div className="mt-3 flex items-center gap-2 text-[12.5px]" style={{ opacity: 0.95 }}>
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full"
          style={{ background: 'rgba(255,255,255,0.25)' }}
        >
          <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
        </div>
        <span style={{ fontWeight: 700 }}>
          {total} / {goal}
        </span>
      </div>
      {editing ? (
        <form
          className="mt-3 flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!saving) void save();
          }}
        >
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={MIN_GOAL}
              max={MAX_GOAL}
              value={value}
              autoFocus
              onChange={(e) => setValue(e.target.value)}
              className="h-7 w-20 rounded-md px-2 text-[12.5px]"
              style={{
                background: 'rgba(255,255,255,0.92)',
                color: 'var(--yume-ink)',
                border: '1px solid rgba(255,255,255,0.6)',
              }}
            />
            <button
              type="submit"
              disabled={saving}
              className="rounded-full px-3 py-1 text-[11.5px] font-semibold"
              style={{
                background: '#fff',
                color: 'var(--yume-coral-deep, #c45a4a)',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="text-[11.5px] underline"
              style={{ color: 'rgba(255,255,255,0.9)' }}
            >
              Cancel
            </button>
          </div>
          {error && (
            <div className="text-[11px]" style={{ color: '#fff', opacity: 0.95 }}>
              {error}
            </div>
          )}
        </form>
      ) : (
        <div className="mt-3 text-[12px]" style={{ opacity: 0.85 }}>
          Goal: <strong style={{ opacity: 1 }}>{goal} sent applications</strong>.
        </div>
      )}
    </PillowCard>
  );
}
