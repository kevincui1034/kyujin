// Single source of truth for plan metadata. Imported by the billing page,
// the Stripe checkout/webhook routes, and any code that enforces plan caps.
// Display labels live here; actual amounts charged live on the Stripe Price
// records the env vars point to. Keep both sides in sync manually — the
// webhook will write whichever planId the price ID maps to regardless of
// what's printed here.
//
// There is no free tier — every active subscription is a paid plan. The
// `users.plan` column still stores the literal `'free'` (NO_PLAN) when a
// user has no active subscription (never subscribed, or cancelled and past
// the period end). That value is a state sentinel, not a marketable plan.

export type PlanId = 'standard' | 'premium';
export type BillingCadence = 'monthly' | 'annual';

// DB sentinel for "no active paid subscription". Kept as 'free' so the
// existing `users.plan` column default and historical rows stay valid.
export const NO_PLAN = 'free' as const;
export type NoPlan = typeof NO_PLAN;

export interface Plan {
  id: PlanId;
  name: string;
  // Display strings shown on the billing cards.
  priceLabelMonthly: string;
  priceLabelAnnual: string;
  // Cents/month for telemetry and order-by; cents/year is what actually
  // shows up on a Stripe invoice for an annual plan.
  priceCentsMonthly: number;
  priceCentsAnnual: number;
  // Cap on Gmail messages pulled per backfill (matches PLAN_CAP in
  // /api/gmail/backfill/route.ts).
  backfillCap: number;
  // Longest backfill window (in days) this plan can request.
  maxBackfillDays: number;
  // Rolling-30-day cap on LLM classifier calls (generateObject hits — does
  // not count pre-filter/regex short-circuits). Bounds the worst-case
  // widening-window backfill cost: at ~$0.0002/call, 10k = ~$2 of LLM,
  // 30k = ~$6 — both comfortably inside each plan's contribution margin.
  monthlyClassifierCap: number;
  // Hard limit on connected Gmail inboxes. Multi-inbox is Premium-only;
  // Standard (and unsubscribed) users cap at 1.
  inboxLimit: number;
  // Short user-facing bullets.
  features: string[];
}

// Default annual prices are ~17% off (10x monthly = "2 months free"), a
// standard SaaS pattern. Override the Stripe Price records themselves to
// charge something different — these labels are display-only.
export const PLANS: Record<PlanId, Plan> = {
  standard: {
    id: 'standard',
    name: 'Standard',
    priceLabelMonthly: '$8.99',
    priceLabelAnnual: '$89.90',
    priceCentsMonthly: 899,
    priceCentsAnnual: 8990,
    backfillCap: 1000,
    maxBackfillDays: 240,
    monthlyClassifierCap: 10_000,
    inboxLimit: 1,
    features: [
      'Single Gmail inbox',
      'Backfill up to 1,000 historical emails',
      'Up to 240-day window',
      'One backfill every 24 hours',
    ],
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    priceLabelMonthly: '$13.99',
    priceLabelAnnual: '$129.90',
    priceCentsMonthly: 1399,
    priceCentsAnnual: 12990,
    backfillCap: 3000,
    maxBackfillDays: 365,
    monthlyClassifierCap: 15_000,
    inboxLimit: 2,
    features: [
      'Up to 2 Gmail inboxes',
      'Backfill up to 3,000 historical emails',
      'Full 365-day window',
      '2 backfills every 5 hours',
      'Priority support',
    ],
  },
};

export function isPaidPlan(id: string | null | undefined): id is PlanId {
  return id === 'standard' || id === 'premium';
}

// Plan precedence used by the upgrade/downgrade button labels. Non-paid /
// unknown values rank 0.
export const PLAN_RANK: Record<PlanId, number> = { standard: 1, premium: 2 };

export function planRank(id: string | null | undefined): number {
  return isPaidPlan(id) ? PLAN_RANK[id] : 0;
}
