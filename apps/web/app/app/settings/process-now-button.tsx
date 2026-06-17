'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Cool-down (seconds) enforced client-side after a run so the queue isn't
// hammered with overlapping 5-minute drains. The button stays disabled and
// shows a countdown until it elapses.
const COOLDOWN_SECONDS = 60;

// Drains the backfill queue on demand via /api/gmail/process instead of waiting
// for the 5-minute cron tick. A single request can run up to ~300s; the full
// queue may need several runs, so we warn it can take a while up front, then
// rate-limit re-runs with a 60s cooldown.
export function ProcessNowButton() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function startCooldown() {
    setCooldown(COOLDOWN_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  async function run() {
    setOpen(false);
    setState('running');
    setMessage(null);
    try {
      const res = await fetch('/api/gmail/process', { method: 'POST' });
      const json = (await res.json()) as {
        processed?: number;
        failed?: number;
        drained?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok) throw new Error(json.message ?? json.error ?? 'failed');
      const processed = json.processed ?? 0;
      const failed = json.failed ?? 0;
      if (processed === 0 && failed === 0) {
        setMessage('Queue is already empty — nothing to process.');
      } else {
        const failedNote = failed ? `, ${failed} failed` : '';
        const moreNote = json.drained ? '' : ' Hit the batch limit — run again to finish.';
        setMessage(
          `Processed ${processed} message${processed === 1 ? '' : 's'}${failedNote}.${moreNote}`,
        );
      }
      setState('done');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Processing failed.');
      setState('error');
    } finally {
      // Cool-down applies whether the run succeeded or failed — a failed run
      // still kicked off Gmail/LLM work we don't want to immediately repeat.
      startCooldown();
    }
  }

  const running = state === 'running';
  const disabled = running || cooldown > 0;

  let label: string;
  if (running) label = 'Processing…';
  else if (cooldown > 0) label = `Wait ${cooldown}s`;
  else label = 'Process queued now';

  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {label}
      </Button>
      {state === 'done' && message && (
        <span className="text-xs text-muted-foreground">{message}</span>
      )}
      {state === 'error' && message && (
        <span className="text-xs text-destructive">{message}</span>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process queued messages now?</DialogTitle>
            <DialogDescription>
              This classifies every message in the backfill queue right now instead of waiting for
              the 5-minute cron tick. Depending on how many messages are queued, it can take up to
              30 minutes to finish — keep this tab open while it runs. New applications appear on
              your dashboard as they&apos;re classified.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={run}>Process now</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
