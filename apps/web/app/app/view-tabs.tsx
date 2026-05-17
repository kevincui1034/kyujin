'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export type DashboardView = 'flow' | 'activity' | 'outcomes';

const TABS: { key: DashboardView; label: string }[] = [
  { key: 'flow', label: 'Flow' },
  { key: 'activity', label: 'Activity' },
  { key: 'outcomes', label: 'Outcomes' },
];

interface Props {
  active: DashboardView;
}

export function ViewTabs({ active }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<DashboardView | null>(null);
  const [, startTransition] = useTransition();

  async function pick(view: DashboardView) {
    if (view === active || pending) return;
    setPending(view);
    const res = await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dashboardView: view }),
    });
    if (!res.ok) {
      setPending(null);
      return;
    }
    startTransition(() => {
      router.refresh();
      setPending(null);
    });
  }

  return (
    <div className="flex gap-1" style={{ fontSize: 12 }}>
      {TABS.map((t) => {
        const isActive = t.key === active;
        const isPending = pending === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => pick(t.key)}
            disabled={pending !== null}
            className="rounded-full px-3 py-1 transition-colors"
            style={{
              fontWeight: 600,
              color: isActive ? 'var(--yume-pink-700)' : 'var(--yume-ink-soft)',
              background: isActive ? 'rgba(232,90,122,0.10)' : 'transparent',
              border: isActive ? '1px solid rgba(232,90,122,0.22)' : '1px solid transparent',
              opacity: pending && !isPending ? 0.5 : 1,
              cursor: pending !== null ? 'wait' : 'pointer',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
