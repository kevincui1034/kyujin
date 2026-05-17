import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { auth } from '@/auth';
import { db } from '@kyujin/db/client';
import { users } from '@kyujin/db/schema';
import { appUrlOrigin, getStripe, priceIdFor } from '@/lib/stripe';
import { activeEntitlementSource } from '@/lib/entitlements';

const bodySchema = z.object({
  plan: z.enum(['standard', 'premium']),
  cadence: z.enum(['monthly', 'annual']),
});

// POST /api/billing/checkout — starts a Stripe Checkout Session for the
// selected (plan, cadence). Returns { url } on success; the client redirects
// the browser to it. On return Stripe sends the user to {origin}/app/settings/billing
// regardless of outcome; the webhook is what actually flips `users.plan`.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const userId = session.user.id;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const { plan, cadence } = parsed.data;

  const priceId = priceIdFor(plan, cadence);
  if (!priceId) {
    return NextResponse.json(
      { error: 'price_not_configured', plan, cadence },
      { status: 500 },
    );
  }

  // Cross-platform guard. The billing UI hides the Subscribe button when the
  // user is already entitled via App Store, but a stale browser cache could
  // still let them POST here. Block early — a second active subscription
  // would mean the user pays twice with no automatic refund path.
  const existingSource = await activeEntitlementSource(userId);
  if (existingSource === 'apple') {
    return NextResponse.json(
      {
        error: 'apple_subscription_active',
        message:
          'You already subscribe to Yume through the App Store. Open Settings › Apple ID › Subscriptions on your iPhone to cancel, then re-subscribe here.',
      },
      { status: 409 },
    );
  }

  const [user] = await db
    .select({
      email: users.email,
      stripeCustomerId: users.stripeCustomerId,
      trialUsedAt: users.trialUsedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
  }

  // 7-day free trial: only on Standard, and only once per user across any
  // platform. Premium is full price from day one — keeps the trial offer
  // simple to message and prevents a "trial on Premium then immediately
  // downgrade to Standard" loop that effectively trials the cheaper plan.
  const trialEligible = plan === 'standard' && user.trialUsedAt === null;

  const stripe = getStripe();

  // Lazy-create the Customer record on first checkout. Storing the customer
  // ID on the user lets the webhook resolve `customer` → user without
  // touching Stripe metadata. The Customer is reused for subsequent plan
  // changes via the Customer Portal.
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId },
    });
    customerId = customer.id;
    await db
      .update(users)
      .set({ stripeCustomerId: customerId })
      .where(eq(users.id, userId));
  }

  const origin = appUrlOrigin(req);
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/app/settings/billing?checkout=success`,
    cancel_url: `${origin}/app/settings/billing?checkout=cancel`,
    allow_promotion_codes: true,
    // Stripe sends `client_reference_id` back on the completed event, giving
    // a second path (besides customer lookup) to identify the user. Cheap
    // belt-and-suspenders.
    client_reference_id: userId,
    // Card-on-file is forced. Stripe's default for subscription mode would
    // make payment_method optional during a trial; for an auto-charging
    // trial the card MUST be captured at checkout — otherwise day 7 lands
    // in 'incomplete' and the user is silently not charged.
    payment_method_collection: 'always',
    subscription_data: {
      metadata: { userId, plan, cadence },
      ...(trialEligible
        ? {
            trial_period_days: 7,
            trial_settings: {
              // Belt-and-suspenders for the rare case where the card we
              // captured at checkout becomes invalid (expired, removed) by
              // day 7. Default 'create_invoice' would leave the sub in a
              // limbo 'incomplete' state — explicit cancel is cleaner.
              end_behavior: { missing_payment_method: 'cancel' },
            },
          }
        : {}),
    },
  });

  if (!checkoutSession.url) {
    return NextResponse.json({ error: 'checkout_session_no_url' }, { status: 500 });
  }
  return NextResponse.json({ url: checkoutSession.url });
}
