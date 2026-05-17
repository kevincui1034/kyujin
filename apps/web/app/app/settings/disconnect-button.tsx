'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface Props {
  connectionId?: string;
  label?: string;
  // Provider's API prefix (`/api/gmail` or `/api/email`). Passed in from the
  // server parent because client components can't read process.env safely.
  apiPrefix?: string;
}

export function DisconnectGmailButton({
  connectionId,
  label = 'Disconnect Gmail',
  apiPrefix = '/api/gmail',
}: Props) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  async function disconnect() {
    await fetch(`${apiPrefix}/disconnect`, {
      method: 'POST',
      headers: connectionId ? { 'content-type': 'application/json' } : undefined,
      body: connectionId ? JSON.stringify({ connectionId }) : undefined,
    });
    startTransition(() => {
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
        {label}
      </Button>
    );
  }
  return (
    <div className="flex gap-2">
      <Button variant="destructive" size="sm" disabled={pending} onClick={disconnect}>
        Confirm
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </div>
  );
}
