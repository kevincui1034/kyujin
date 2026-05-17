'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { SourceTag } from '@/components/source-tag';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { APPLICATION_STATUSES, type ApplicationStatus } from '@kyujin/shared/types';
import {
  APPLICATION_SOURCES,
  APPLICATION_SOURCE_LABELS,
  getApplicationSource,
  type ApplicationSource,
} from '@kyujin/shared/sender-domains';

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  no_response: 'No answer',
  interview: 'Interview',
  rejected: 'Rejected',
  accepted: 'Offer',
  obtained: 'Accepted',
};

// Stops the row's enclosing <Link> from navigating when the user clicks the
// editor trigger or an item in the popover.
function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export function RowStatusEditor({
  applicationId,
  currentStatus,
}: {
  applicationId: string;
  currentStatus: ApplicationStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function change(next: ApplicationStatus) {
    if (next === currentStatus || busy) return;
    setBusy(true);
    const res = await fetch(`/api/applications/${applicationId}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    if (!res.ok) return;
    startTransition(() => router.refresh());
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        asChild
        onClick={stop}
        disabled={pending || busy}
        aria-label="Change status"
      >
        <button
          type="button"
          className="inline-flex items-center rounded-md transition-opacity hover:opacity-80 disabled:opacity-60"
        >
          <StatusBadge status={currentStatus} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={stop}>
        {APPLICATION_STATUSES.map((s) => (
          <DropdownMenuItem
            key={s}
            onSelect={() => {
              void change(s);
            }}
            className="text-[12px]"
          >
            <span className="flex w-full items-center justify-between gap-3">
              {STATUS_LABEL[s]}
              {s === currentStatus && <Check className="h-3.5 w-3.5" aria-hidden />}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RowSourceEditor({
  applicationId,
  currentSourceDomain,
}: {
  applicationId: string;
  currentSourceDomain: string | null;
}) {
  const router = useRouter();
  const current = getApplicationSource(currentSourceDomain);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function change(next: ApplicationSource) {
    if (next === current || busy) return;
    setBusy(true);
    const res = await fetch(`/api/applications/${applicationId}/source`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: next }),
    });
    setBusy(false);
    if (!res.ok) return;
    startTransition(() => router.refresh());
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        asChild
        onClick={stop}
        disabled={pending || busy}
        aria-label="Change source"
      >
        <button
          type="button"
          className="inline-flex items-center rounded-md transition-opacity hover:opacity-80 disabled:opacity-60"
        >
          <SourceTag source={current} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={stop}>
        {APPLICATION_SOURCES.map((s) => (
          <DropdownMenuItem
            key={s}
            onSelect={() => {
              void change(s);
            }}
            className="text-[12px]"
          >
            <span className="flex w-full items-center justify-between gap-3">
              {APPLICATION_SOURCE_LABELS[s]}
              {s === current && <Check className="h-3.5 w-3.5" aria-hidden />}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
