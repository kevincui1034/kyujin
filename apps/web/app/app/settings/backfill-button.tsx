'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const WINDOWS = [
  { days: 30, label: '30 days', premium: false },
  { days: 90, label: '90 days', premium: false },
  { days: 120, label: '120 days', premium: true },
  { days: 240, label: '240 days', premium: true },
  { days: 365, label: '365 days', premium: true },
] as const;

interface Props {
  isPremium: boolean;
}

export function BackfillButton({ isPremium }: Props) {
  const [days, setDays] = useState<number>(90);
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setState('running');
    setMessage(null);
    try {
      const res = await fetch('/api/gmail/backfill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ days }),
      });
      const json = (await res.json()) as {
        enqueued?: number;
        firstBackfill?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok) throw new Error(json.message ?? json.error ?? 'failed');
      const count = json.enqueued ?? 0;
      setMessage(
        json.firstBackfill
          ? `Enqueued ${count} messages from the last ${days} days. Processing now — applications will appear on your dashboard as they're classified.`
          : `Enqueued ${count} messages from the last ${days} days. They'll classify on the next cron tick.`,
      );
      setState('done');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Backfill failed.');
      setState('error');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {WINDOWS.map((w) => {
          const locked = w.premium && !isPremium;
          const selected = w.days === days;
          return (
            <Button
              key={w.days}
              type="button"
              variant={selected ? 'default' : 'outline'}
              size="sm"
              disabled={locked}
              onClick={() => setDays(w.days)}
              title={locked ? 'Premium plan required for windows beyond 90 days' : undefined}
              className="gap-1.5"
            >
              {w.label}
              {w.premium && (
                <Badge variant={isPremium ? 'success' : 'muted'} className="px-1.5 py-0 text-[9px]">
                  {isPremium ? 'Premium' : 'Locked'}
                </Badge>
              )}
            </Button>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" disabled={state === 'running'} onClick={run}>
          {state === 'running' ? 'Queueing…' : `Run ${days}-day backfill`}
        </Button>
        {state === 'done' && message && (
          <span className="text-xs text-muted-foreground">{message}</span>
        )}
        {state === 'error' && message && (
          <span className="text-xs text-destructive">{message}</span>
        )}
      </div>
      {!isPremium && (
        <p className="text-[11px] text-muted-foreground">
          Premium unlocks backfills up to 365 days. Free plan is capped at 90.
        </p>
      )}
    </div>
  );
}
