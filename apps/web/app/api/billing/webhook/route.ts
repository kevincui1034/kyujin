import { NextResponse, type NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { db } from '@kyujin/db/client';
import { users } from '@kyujin/db/schema';
import { getStripe } from '@/lib/stripe';
import { recomputeUserPlan } from '@/lib/entitlements';
import { sendTrialEndingEmail } from '@/lib/billing-emails';
import { apiError } from '@/lib/api-errors';
import { log } from '@/lib/log';

// Stripe needs the EXACT raw bytes for signature verification — any JSON
// reparse mutates whitespace and the HMAC no longer matches. App Router's
// req.text() returns the unmodified body, which is what we want. Force the
// route onto the Node runtime so we can pull the env-secret and use the
// Stripe SDK's verifier.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/billing/webhook — Stripe → us. NEVER authenticated; signature
// verification is the only trust signal. Responds 2xx as fast as possible so
// Stripe doesn't retry; any DB write failure should be logged but still 200
// so we don't end up in an infinite retry loop on a poison-pill event. The
// next webhook (or the periodic reconcile job) will pick up corrections.
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 500 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'no_signature' }, { status: 400 });
  }

  const rawBody = await req.text();
  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    return apiError('invalid_signature', { cause: err });
  }

  try {
    await handleEvent(event);
  } catch (err) {
    // Log but ack — see top-of-file comment about retry behavior.
    log.error({ kind: 'billing.stripe.handler_failed', eventType: event.type, cause: err });
  }
  return NextResponse.json({ received: true });
}

// Events we care about. Stripe sends many more — we ignore the rest. Adding
// a new handler is the only place that maps Stripe state → user.plan, so
// the source of truth for plan transitions is local to this file.
async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      // `subscription` is present in subscription-mode sessions. Expand it
      // here rather than relying on a follow-up subscription.created event,
      // because Stripe doesn't guarantee delivery order.
      if (session.mode !== 'subscription' || !session.subscription) return;
      const subId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
      const subscription = await getStripe().subscriptions.retrieve(subId);
      await applySubscriptionToUser(subscription, session.client_reference_id ?? null);
      return;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      await applySubscriptionToUser(subscription, null);
      return;
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await clearSubscription(subscription);
      return;
    }
    case 'customer.subscription.trial_will_end': {
      // Fires 3 days before the trial ends. Stripe does NOT auto-send a
      // reminder email — Visa/MC rules (and EU consumer law) require us to.
      // Skipping this is the #1 source of trial chargebacks.
      const subscription = event.data.object as Stripe.Subscription;
      await sendTrialEndingEmail(subscription);
      return;
    }
    // invoice.* events don't change the plan on their own — the corresponding
    // subscription.updated fires alongside them — but logging them is useful
    // when chasing past_due states. Intentionally not handled.
    default:
      return;
  }
}

// Mirror Stripe's view onto the user's stripe_* columns, then re-derive the
// plan from BOTH the Stripe and Apple state via recomputeUserPlan. The
// derivation is the only place that decides "what plan is this user on" —
// here we just record what Stripe told us. That way an active Apple sub
// isn't silently downgraded if Stripe sends a canceled event for a sub the
// user is no longer using.
async function applySubscriptionToUser(
  subscription: Stripe.Subscription,
  clientReferenceUserId: string | null,
): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  const userId = await resolveUserId({
    customerId,
    metadataUserId: typeof subscription.metadata?.userId === 'string' ? subscription.metadata.userId : null,
    clientReferenceUserId,
  });
  if (!userId) {
    log.warn({
      kind: 'billing.stripe.user_not_found',
      customerId,
      subscriptionId: subscription.id,
    });
    return;
  }

  const priceId = subscription.items.data[0]?.price.id ?? null;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;

  // Stamp trialUsedAt the first time we observe an entitling trial. `coalesce`
  // means a user who renews / changes plans during their trial doesn't have
  // the timestamp overwritten on every subscription.updated event. Once set,
  // this column blocks a second trial offer in the checkout route — even if
  // the user cancels and re-subscribes weeks later.
  const isTrialing = subscription.status === 'trialing';

  await db
    .update(users)
    .set({
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripeSubscriptionStatus: subscription.status,
      stripePriceId: priceId,
      stripeCurrentPeriodEnd: periodEnd,
      stripeCancelAtPeriodEnd: subscription.cancel_at_period_end,
      ...(isTrialing
        ? { trialUsedAt: sql`coalesce(${users.trialUsedAt}, now())` }
        : {}),
    })
    .where(eq(users.id, userId));
  await recomputeUserPlan(userId);
  // State-transition audit. Cheap signal that lets us answer "did this user
  // actually get upgraded?" without trawling Stripe.
  log.info({
    kind: 'billing.stripe.subscription_applied',
    userId,
    status: subscription.status,
    priceId,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}

async function clearSubscription(subscription: Stripe.Subscription): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const userId = await resolveUserId({
    customerId,
    metadataUserId: typeof subscription.metadata?.userId === 'string' ? subscription.metadata.userId : null,
    clientReferenceUserId: null,
  });
  if (!userId) return;
  await db
    .update(users)
    .set({
      stripeSubscriptionId: null,
      stripeSubscriptionStatus: 'canceled',
      stripePriceId: null,
      stripeCurrentPeriodEnd: null,
      stripeCancelAtPeriodEnd: false,
    })
    .where(eq(users.id, userId));
  await recomputeUserPlan(userId);
  log.info({ kind: 'billing.stripe.subscription_canceled', userId });
}

// Three signals point to the same user: subscription metadata.userId (set at
// Checkout time), checkout.session.client_reference_id (also set), and the
// stripe_customer_id we wrote during Checkout. Try the cheapest first.
async function resolveUserId(params: {
  customerId: string;
  metadataUserId: string | null;
  clientReferenceUserId: string | null;
}): Promise<string | null> {
  const { customerId, metadataUserId, clientReferenceUserId } = params;
  if (metadataUserId) return metadataUserId;
  if (clientReferenceUserId) return clientReferenceUserId;
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);
  return row?.id ?? null;
}
