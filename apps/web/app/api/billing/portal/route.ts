import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@kyujin/db/client';
import { users } from '@kyujin/db/schema';
import { appUrlOrigin, getStripe } from '@/lib/stripe';

// POST /api/billing/portal — opens the Stripe-hosted Customer Portal for
// the current user. Used for plan changes, cancellation, invoice history,
// and payment-method updates. 400 if the user has never run through
// Checkout (no customer ID yet).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const [user] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user?.stripeCustomerId) {
    return NextResponse.json({ error: 'no_customer' }, { status: 400 });
  }

  const stripe = getStripe();
  const portal = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${appUrlOrigin(req)}/app/settings/billing`,
  });
  return NextResponse.json({ url: portal.url });
}
