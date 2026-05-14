'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function DisconnectGmailButton() {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  async function disconnect() {
    await fetch('/api/gmail/disconnect', { method: 'POST' });
    startTransition(() => {
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <Button variant="outline" onClick={() => setConfirming(true)}>
        Disconnect Gmail
      </Button>
    );
  }
  return (
    <div className="flex gap-2">
      <Button variant="destructive" disabled={pending} onClick={disconnect}>
        Confirm disconnect
      </Button>
      <Button variant="ghost" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </div>
  );
}
