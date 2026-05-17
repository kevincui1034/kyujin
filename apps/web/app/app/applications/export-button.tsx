'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  isPaid: boolean;
}

export function ExportButton({ isPaid }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch('/api/applications/export');
      if (res.status === 402) {
        setError('Paid plan required');
        return;
      }
      if (!res.ok) {
        setError(`Export failed (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Use the server-provided filename when available; fall back to a default.
      const disposition = res.headers.get('content-disposition') ?? '';
      const match = disposition.match(/filename="?([^";]+)"?/);
      a.download = match?.[1] ?? `kyujin-applications-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setDownloading(false);
    }
  }

  if (!isPaid) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        title="A paid plan is required for CSV export"
        className="h-10 rounded-full text-kyujin-ink-muted"
      >
        🔒 Export CSV
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={downloading}
        onClick={download}
        className="h-10 rounded-full"
      >
        {downloading ? 'Exporting…' : 'Export CSV'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
