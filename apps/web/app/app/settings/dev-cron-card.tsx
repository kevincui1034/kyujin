'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type Job =
  | 'process-batch'
  | 'process-all'
  | 'refresh-watches'
  | 'reclassify'
  | 'reclassify-targeted'
  | 'reclassify-needs-fix'
  | 'reclassify-handshake'
  | 'reclassify-unclassified';

interface Result {
  job: Job;
  ok: boolean;
  payload: unknown;
  durationMs: number;
}

const JOB_URLS: Record<Job, string> = {
  'process-batch': '/api/dev/run-cron?job=process-batch',
  'process-all': '/api/dev/process-all',
  'refresh-watches': '/api/dev/run-cron?job=refresh-watches',
  reclassify: '/api/dev/reclassify',
  'reclassify-targeted': '/api/dev/reclassify?mode=targeted',
  'reclassify-needs-fix': '/api/dev/reclassify?mode=needs-fix',
  'reclassify-handshake': '/api/dev/reclassify?mode=handshake',
  'reclassify-unclassified': '/api/dev/reclassify?mode=unclassified',
};

export function DevCronCard() {
  const [pending, setPending] = useState<Job | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function run(job: Job) {
    setPending(job);
    setResult(null);
    const started = Date.now();
    try {
      const res = await fetch(JOB_URLS[job], { method: 'POST' });
      const payload: unknown = await res.json().catch(() => ({}));
      setResult({ job, ok: res.ok, payload, durationMs: Date.now() - started });
    } catch (err) {
      setResult({
        job,
        ok: false,
        payload: { error: err instanceof Error ? err.message : String(err) },
        durationMs: Date.now() - started,
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader>
        <CardTitle className="text-base">Dev — run cron now</CardTitle>
        <CardDescription>
          Local-only shortcut to fire cron jobs without the schedule. Hidden in production.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pending !== null}
            onClick={() => run('process-batch')}
          >
            {pending === 'process-batch' ? 'Running…' : 'Run process-batch'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pending !== null}
            onClick={() => run('process-all')}
          >
            {pending === 'process-all' ? 'Draining…' : 'Process all queued'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pending !== null}
            onClick={() => run('refresh-watches')}
          >
            {pending === 'refresh-watches' ? 'Running…' : 'Run refresh-watches'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pending !== null}
            onClick={() => run('reclassify-targeted')}
          >
            {pending === 'reclassify-targeted' ? 'Running…' : 'Reclassify vendor-name apps only'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pending !== null}
            onClick={() => run('reclassify-needs-fix')}
          >
            {pending === 'reclassify-needs-fix' ? 'Running…' : 'Reclassify vendor + empty-role'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pending !== null}
            onClick={() => run('reclassify-handshake')}
          >
            {pending === 'reclassify-handshake' ? 'Running…' : 'Reclassify Handshake only'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pending !== null}
            onClick={() => run('reclassify-unclassified')}
          >
            {pending === 'reclassify-unclassified'
              ? 'Running…'
              : 'Reclassify newly-eligible (career/subject)'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pending !== null}
            onClick={() => run('reclassify')}
          >
            {pending === 'reclassify' ? 'Running…' : 'Reclassify all emails'}
          </Button>
        </div>
        {result && (
          <pre className="overflow-auto rounded-md border bg-background p-3 text-[11px]">
            <span className="text-muted-foreground">
              {result.job} · {result.ok ? 'ok' : 'error'} · {result.durationMs}ms
            </span>
            {'\n'}
            {JSON.stringify(result.payload, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
