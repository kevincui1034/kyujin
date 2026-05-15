'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function StartWatchButton() {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setState('running');
    try {
      const res = await fetch('/api/gmail/watch', { method: 'POST' });
      const json = (await res.json()) as { expiration?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'failed');
      const expiresAt = json.expiration
        ? new Date(Number(json.expiration)).toLocaleString()
        : 'unknown';
      setMessage(`Watch active until ${expiresAt}.`);
      setState('done');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to start watch.');
      setState('error');
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" disabled={state === 'running'} onClick={run}>
        {state === 'running' ? 'Starting…' : 'Start Gmail push notifications'}
      </Button>
      {state === 'done' && message && (
        <span className="text-xs text-muted-foreground">{message}</span>
      )}
      {state === 'error' && message && (
        <span className="text-xs text-destructive">{message}</span>
      )}
    </div>
  );
}
