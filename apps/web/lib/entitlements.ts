import { eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { users } from '@kyujin/db/schema';
import { appleProductConfigFor } from './apple';
import { priceConfigForId } from './stripe';
import { NO_PLAN, PLAN_RANK, type BillingCadence, type PlanId } from './plans';

// Single source of truth for "which plan, if any, is this user entitled to
// right now?" Reads both the Stripe and Apple columns from `users`, applies
// the same entitling-status rules each platform uses, picks the higher tier
// when both are active, and returns a single derived view.
//
// `users.plan` is a denormalized cache of this function's output. The two
// webhooks (Stripe and Apple) and the verify endpoint each call
// `recomputeUserPlan(userId)` after writing their platform's columns; that
// helper re-runs the derivation and persists the result. Read-paths can
// read `users.plan` directly without going through this function.

export type EntitlementSource = 'stripe' | 'apple' | 'none';

export interface Entitlement {
  plan: PlanId | typeof NO_PLAN;
  source: EntitlementSource;
  cadence: BillingCadence | null;
  // For an active entitlement: when it next renews (or, if cancel-scheduled,
  // when it lapses). Null when the user has no paid plan. During a trial this
  // is the trial end date (= when the first charge happens).
  currentPeriodEnd: Date | null;
  // True when the user has scheduled cancellation: Stripe sub with
  // cancel_at_period_end, or Apple sub with auto_renew off. Tells the UI
  // to render "cancels on …" instead of "renews on …".
  cancelScheduled: boolean;
  // True while the user is in an entitling trial. Stripe sub status
  // 'trialing', or Apple sub where the latest transaction is an
  // introductory offer that hasn't billed yet. UI uses this to show
  // "Trial ends …" instead of "Renews on …".
  trialing: boolean;
}

// Subset of users we need for derivation. Inlined rather than re-exporting
// the full Drizzle inferred type so the function can be called with a
// hand-picked SELECT (the webhooks read just these columns).
export interface EntitlementInput {
  stripeSubscriptionStatus: string | null;
  stripePriceId: string | null;
  stripeCurrentPeriodEnd: Date | null;
  stripeCancelAtPeriodEnd: boolean;
  appleSubscriptionStatus: string | null;
  appleProductId: string | null;
  appleExpiresAt: Date | null;
  appleAutoRenewEnabled: boolean;
  appleEnvironment: string | null;
  appleInIntroOffer: boolean;
}

const STRIPE_ENTITLING = new Set(['active', 'trialing', 'past_due']);
// Apple notification statuses that should still entitle the user. Grace
// period and billing retry mean Apple is mid-recovery — keep the user paid
// rather than yanking access while their card retries.
const APPLE_ENTITLING = new Set(['active', 'in_grace_period', 'in_billing_retry']);

export function deriveEntitlement(input: EntitlementInput): Entitlement {
  const stripe = deriveStripe(input);
  const apple = deriveApple(input);

  if (!stripe && !apple) {
    return { plan: NO_PLAN, source: 'none', cadence: null, currentPeriodEnd: null, cancelScheduled: false, trialing: false };
  }
  if (stripe && !apple) return stripe;
  if (apple && !stripe) return apple;
  // Both active. Higher tier wins; ties broken by the platform with the
  // later period end (so a freshly-renewed sub beats one approaching lapse).
  const stripeRank = PLAN_RANK[stripe!.plan as PlanId] ?? 0;
  const appleRank = PLAN_RANK[apple!.plan as PlanId] ?? 0;
  if (stripeRank !== appleRank) return stripeRank > appleRank ? stripe! : apple!;
  const stripeEnd = stripe!.currentPeriodEnd?.getTime() ?? 0;
  const appleEnd = apple!.currentPeriodEnd?.getTime() ?? 0;
  return stripeEnd >= appleEnd ? stripe! : apple!;
}

function deriveStripe(input: EntitlementInput): Entitlement | null {
  if (!input.stripeSubscriptionStatus || !STRIPE_ENTITLING.has(input.stripeSubscriptionStatus)) {
    return null;
  }
  if (!input.stripePriceId) return null;
  const config = priceConfigForId(input.stripePriceId);
  if (!config) return null;
  return {
    plan: config.planId,
    source: 'stripe',
    cadence: config.cadence,
    currentPeriodEnd: input.stripeCurrentPeriodEnd,
    cancelScheduled: input.stripeCancelAtPeriodEnd,
    trialing: input.stripeSubscriptionStatus === 'trialing',
  };
}

function deriveApple(input: EntitlementInput): Entitlement | null {
  if (!input.appleSubscriptionStatus || !APPLE_ENTITLING.has(input.appleSubscriptionStatus)) {
    return null;
  }
  if (!input.appleProductId) return null;
  // Sandbox subscriptions only entitle outside of production. Prevents a
  // TestFlight tester from unlocking a real prod account by piping their
  // sandbox transaction at the live server.
  const env = process.env.APPLE_ENVIRONMENT === 'Production' ? 'Production' : 'Sandbox';
  if (env === 'Production' && input.appleEnvironment === 'Sandbox') return null;
  const config = appleProductConfigFor(input.appleProductId);
  if (!config) return null;
  // Apple's renewal model is opposite Stripe's: auto_renew=false is the
  // "cancellation scheduled" state.
  return {
    plan: config.planId,
    source: 'apple',
    cadence: config.cadence,
    currentPeriodEnd: input.appleExpiresAt,
    cancelScheduled: !input.appleAutoRenewEnabled,
    // Apple introductory offers (free trials) carry their own offer-type
    // signal on the transaction. We mirror that into appleInIntroOffer when
    // /verify and the webhook update apple columns; defaulting to false here
    // means a row without the bit set reads as "not trialing", which matches
    // the historical behavior for non-trialed Apple subscribers.
    trialing: input.appleInIntroOffer === true,
  };
}

// Read this user's billing columns, derive the entitlement, and write the
// resulting plan back to `users.plan`. Called by every webhook and the
// verify endpoint after they mutate platform-specific columns.
// Returns the derived entitlement so the caller can decide what to log.
export async function recomputeUserPlan(userId: string): Promise<Entitlement> {
  const [row] = await db
    .select({
      stripeSubscriptionStatus: users.stripeSubscriptionStatus,
      stripePriceId: users.stripePriceId,
      stripeCurrentPeriodEnd: users.stripeCurrentPeriodEnd,
      stripeCancelAtPeriodEnd: users.stripeCancelAtPeriodEnd,
      appleSubscriptionStatus: users.appleSubscriptionStatus,
      appleProductId: users.appleProductId,
      appleExpiresAt: users.appleExpiresAt,
      appleAutoRenewEnabled: users.appleAutoRenewEnabled,
      appleEnvironment: users.appleEnvironment,
      appleInIntroOffer: users.appleInIntroOffer,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) {
    return { plan: NO_PLAN, source: 'none', cadence: null, currentPeriodEnd: null, cancelScheduled: false, trialing: false };
  }
  const entitlement = deriveEntitlement(row);
  await db.update(users).set({ plan: entitlement.plan }).where(eq(users.id, userId));
  return entitlement;
}

// Cross-platform conflict guard: returns the platform the user is already
// entitled on, so the route handler can block a duplicate purchase on the
// other side with a clear 409. Returns null when the user has no active
// entitlement (the normal upgrade path).
export async function activeEntitlementSource(
  userId: string,
): Promise<EntitlementSource> {
  const [row] = await db
    .select({
      stripeSubscriptionStatus: users.stripeSubscriptionStatus,
      stripePriceId: users.stripePriceId,
      stripeCurrentPeriodEnd: users.stripeCurrentPeriodEnd,
      stripeCancelAtPeriodEnd: users.stripeCancelAtPeriodEnd,
      appleSubscriptionStatus: users.appleSubscriptionStatus,
      appleProductId: users.appleProductId,
      appleExpiresAt: users.appleExpiresAt,
      appleAutoRenewEnabled: users.appleAutoRenewEnabled,
      appleEnvironment: users.appleEnvironment,
      appleInIntroOffer: users.appleInIntroOffer,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return 'none';
  return deriveEntitlement(row).source;
}
