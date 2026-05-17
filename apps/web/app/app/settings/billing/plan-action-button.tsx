'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { planRank, type BillingCadence, type PlanId } from '@/lib/plans';

interface PlanActionButtonProps {
  targetPlan: PlanId;
  targetCadence: BillingCadence;
  currentPlan: PlanId | string | null | undefined;
  currentCadence: BillingCadence;
  // True when the user is currently entitled via App Store. Web checkout is
  // server-blocked in this state; we surface the redirect-to-iOS message
  // instead of attempting a fetch that we know will 409.
  lockedByApple?: boolean;
}

// POSTs to /api/billing/checkout, then redirects to the Stripe-hosted URL.
// Plan changes for users with an existing subscription still go through
// Checkout — Stripe shows a "switch plan" flow rather than a full new
// subscription. (Cancellation lives on the Customer Portal button instead.)
export function PlanActionButton({
  targetPlan,
  targetCadence,
  currentPlan,
  currentCadence,
  lockedByApple,
}: PlanActionButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCurrent = targetPlan === currentPlan && targetCadence === currentCadence;
  if (isCurrent) {
    return (
      <Button disabled variant="outline" className="w-full">
        Current plan
      </Button>
    );
  }
  if (lockedByApple) {
    return (
      <Button disabled variant="outline" className="w-full">
        Manage in App Store
      </Button>
    );
  }

  const current = planRank(currentPlan);
  const target = planRank(targetPlan);
  const verb = current === 0 ? 'Upgrade' : target > current ? 'Upgrade' : 'Switch';

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan: targetPlan, cadence: targetCadence }),
      });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !data?.url) {
        setError(data?.error ?? 'Could not start checkout');
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
      <Button className="w-full" onClick={go} disabled={busy}>
        {busy ? 'Starting checkout…' : `${verb} to ${targetPlan === 'standard' ? 'Standard' : 'Premium'}`}
      </Button>
      {error && (
        <p className="text-xs text-destructive" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
