'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PLANS, type BillingCadence, type PlanId } from '@/lib/plans';
import { PlanActionButton } from './plan-action-button';

interface BillingPlansProps {
  currentPlan: PlanId | string;
  currentCadence: BillingCadence;
  // When the user is entitled via Apple, web checkout is server-blocked.
  // The plan cards still render (so the lineup is visible) but the button
  // copy explains the path instead of attempting a 409-bound POST.
  lockedByApple?: boolean;
}

// Holds the monthly/annual toggle state and renders the two plan cards.
// Lives in its own client component so the page (server) doesn't need to be
// downgraded to client just for one piece of UI state.
export function BillingPlans({ currentPlan, currentCadence, lockedByApple }: BillingPlansProps) {
  const [cadence, setCadence] = useState<BillingCadence>(currentCadence);

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Billing cadence"
        className="inline-flex rounded-md border bg-muted p-0.5 text-sm"
      >
        <CadenceTab
          active={cadence === 'monthly'}
          onClick={() => setCadence('monthly')}
        >
          Monthly
        </CadenceTab>
        <CadenceTab
          active={cadence === 'annual'}
          onClick={() => setCadence('annual')}
        >
          Annual <span className="ml-1 text-xs text-muted-foreground">save ~17%</span>
        </CadenceTab>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <PlanCard
          planId="standard"
          cadence={cadence}
          currentPlan={currentPlan}
          currentCadence={currentCadence}
          lockedByApple={lockedByApple}
        />
        <PlanCard
          planId="premium"
          cadence={cadence}
          currentPlan={currentPlan}
          currentCadence={currentCadence}
          lockedByApple={lockedByApple}
        />
      </div>
    </div>
  );
}

function CadenceTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded px-3 py-1.5 transition ${
        active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function PlanCard({
  planId,
  cadence,
  currentPlan,
  currentCadence,
  lockedByApple,
}: {
  planId: 'standard' | 'premium';
  cadence: BillingCadence;
  currentPlan: PlanId | string;
  currentCadence: BillingCadence;
  lockedByApple?: boolean;
}) {
  const plan = PLANS[planId];
  const isCurrent = planId === currentPlan && cadence === currentCadence;
  const isFeatured = planId === 'premium';
  const priceLabel = cadence === 'annual' ? plan.priceLabelAnnual : plan.priceLabelMonthly;

  return (
    <Card className={isFeatured ? 'border-foreground/40' : undefined}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{plan.name}</CardTitle>
          {isFeatured && <Badge>Best value</Badge>}
          {isCurrent && !isFeatured && <Badge variant="muted">Current</Badge>}
        </div>
        <CardDescription>
          <span className="text-2xl font-semibold text-foreground">{priceLabel}</span>{' '}
          <span className="text-muted-foreground">/ {cadence === 'annual' ? 'year' : 'month'}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2 text-sm">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <span aria-hidden className="mt-0.5 text-foreground/60">
                ✓
              </span>
              <span className="text-foreground/90">{f}</span>
            </li>
          ))}
        </ul>
        <PlanActionButton
          targetPlan={planId}
          targetCadence={cadence}
          currentPlan={currentPlan}
          currentCadence={currentCadence}
          lockedByApple={lockedByApple}
        />
      </CardContent>
    </Card>
  );
}
