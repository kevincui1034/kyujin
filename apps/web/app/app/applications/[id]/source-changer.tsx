'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { SourceTag } from '@/components/source-tag';
import {
  APPLICATION_SOURCES,
  APPLICATION_SOURCE_LABELS,
  getApplicationSource,
  type ApplicationSource,
} from '@kyujin/shared/sender-domains';

interface Props {
  applicationId: string;
  currentSourceDomain: string | null;
}

export function SourceChanger({ applicationId, currentSourceDomain }: Props) {
  const router = useRouter();
  const currentSource = getApplicationSource(currentSourceDomain);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function change(source: ApplicationSource) {
    if (source === currentSource) {
      setOpen(false);
      return;
    }
    setError(null);
    const res = await fetch(`/api/applications/${applicationId}/source`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? `Source change failed (${res.status})`);
      return;
    }
    setOpen(false);
    startTransition(() => router.refresh());
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex items-center gap-1.5 rounded-md transition-colors"
        title="Change source"
      >
        <SourceTag source={currentSource} />
        <span className="text-[11px] font-medium text-yume-ink-muted underline-offset-2 transition-colors group-hover:text-yume-pink-700 group-hover:underline">
          Edit
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-md border bg-background p-2 shadow-sm">
      <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
        Override source
      </div>
      <div className="flex flex-wrap gap-1">
        {APPLICATION_SOURCES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={s === currentSource ? 'default' : 'outline'}
            disabled={pending}
            onClick={() => change(s)}
            className="h-7 text-[11px]"
          >
            {APPLICATION_SOURCE_LABELS[s]}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setOpen(false)}
          className="h-7 text-[11px]"
        >
          Cancel
        </Button>
      </div>
      {error && <div className="mt-1 text-[11px] text-destructive">{error}</div>}
    </div>
  );
}
