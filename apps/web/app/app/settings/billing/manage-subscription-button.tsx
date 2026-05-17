'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

// Opens the Stripe-hosted Customer Portal. Used for cancellation, payment
// method changes, invoice history, and switching cadence outside of the
// plan-card path. Only rendered for users with an active subscription.
export function ManageSubscriptionButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !data?.url) {
        setError(data?.error ?? 'Could not open portal');
        setBusy(false);
        return;
      }
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button variant="outline" onClick={go} disabled={busy}>
        {busy ? 'Opening…' : 'Manage subscription'}
      </Button>
      {error && (
        <p className="text-xs text-destructive" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
