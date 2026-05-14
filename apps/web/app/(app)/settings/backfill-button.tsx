'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function BackfillButton() {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [count, setCount] = useState<number | null>(null);

  async function run() {
    setState('running');
    try {
      const res = await fetch('/api/gmail/backfill', { method: 'POST' });
      const json = (await res.json()) as { enqueued?: number; found?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'failed');
      setCount(json.enqueued ?? 0);
      setState('done');
    } catch {
      setState('error');
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" disabled={state === 'running'} onClick={run}>
        {state === 'running' ? 'Queueing…' : 'Run 90-day backfill'}
      </Button>
      {state === 'done' && (
        <span className="text-xs text-muted-foreground">
          Enqueued {count} messages. They&apos;ll classify on the next cron tick.
        </span>
      )}
      {state === 'error' && (
        <span className="text-xs text-destructive">Backfill failed. Try reconnecting Gmail.</span>
      )}
    </div>
  );
}
