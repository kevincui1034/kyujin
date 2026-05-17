import Stripe from 'stripe';
import type { BillingCadence, PlanId } from './plans';

// Lazy singleton. Construction throws if STRIPE_SECRET_KEY is missing, which
// surfaces the misconfig as a 500 on the first billing request instead of
// crashing the whole web process at boot — handy because the rest of the
// app is usable in development without billing wired up.
let _client: Stripe | null = null;
export function getStripe(): Stripe {
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  _client = new Stripe(key, {
    // Pin so a Stripe-side default-API bump can't silently change response
    // shapes the webhook depends on. Update intentionally when upgrading.
    apiVersion: '2025-02-24.acacia',
    typescript: true,
  });
  return _client;
}

export interface PriceConfig {
  planId: Extract<PlanId, 'standard' | 'premium'>;
  cadence: BillingCadence;
}

// (planId, cadence) → env var name. Centralized so the webhook lookup and
// the checkout route can't drift on naming.
function envKeyFor(planId: PriceConfig['planId'], cadence: BillingCadence): string {
  return `STRIPE_PRICE_${planId.toUpperCase()}_${cadence.toUpperCase()}`;
}

export function priceIdFor(
  planId: PriceConfig['planId'],
  cadence: BillingCadence,
): string | null {
  const v = process.env[envKeyFor(planId, cadence)];
  return v && v.length > 0 ? v : null;
}

// Reverse map: which (plan, cadence) does an incoming Stripe price ID
// represent? Used by the webhook to translate `subscription.items.data[0].price.id`
// back into the plan we write to `users.plan`.
export function priceConfigForId(priceId: string): PriceConfig | null {
  for (const planId of ['standard', 'premium'] as const) {
    for (const cadence of ['monthly', 'annual'] as const) {
      if (priceIdFor(planId, cadence) === priceId) {
        return { planId, cadence };
      }
    }
  }
  return null;
}

// Public origin used to build Checkout success_url / cancel_url. Prefers the
// explicit env (set in prod) and falls back to the current request URL when
// available (covers preview deployments where the Vercel URL changes per
// branch).
export function appUrlOrigin(req?: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (req) {
    try {
      return new URL(req.url).origin;
    } catch {
      // fall through
    }
  }
  return 'http://localhost:3100';
}
