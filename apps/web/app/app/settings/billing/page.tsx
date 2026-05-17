import { auth } from '@/auth';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getUserProfile } from '@/lib/data';
import { deriveEntitlement } from '@/lib/entitlements';
import { NO_PLAN, isPaidPlan } from '@/lib/plans';
import { BillingPlans } from './billing-plans';
import { ManageSubscriptionButton } from './manage-subscription-button';

function planLabel(plan: string | null | undefined): string {
  if (plan === 'premium') return 'Premium';
  if (plan === 'standard') return 'Standard';
  return 'Not subscribed';
}

function formatDate(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function BillingSettingsPage() {
  const session = await auth();
  const profile = await getUserProfile(session!.user.id);

  // Derive the live entitlement from BOTH Stripe + Apple state. Falls back
  // to NO_PLAN with source 'none' when the profile is empty (shouldn't
  // happen for a logged-in user, but keeps the type happy).
  const entitlement = profile
    ? deriveEntitlement({
        stripeSubscriptionStatus: profile.stripeSubscriptionStatus,
        stripePriceId: profile.stripePriceId,
        stripeCurrentPeriodEnd: profile.stripeCurrentPeriodEnd,
        stripeCancelAtPeriodEnd: profile.stripeCancelAtPeriodEnd,
        appleSubscriptionStatus: profile.appleSubscriptionStatus,
        appleProductId: profile.appleProductId,
        appleExpiresAt: profile.appleExpiresAt,
        appleAutoRenewEnabled: profile.appleAutoRenewEnabled,
        appleEnvironment: profile.appleEnvironment,
        appleInIntroOffer: profile.appleInIntroOffer,
      })
    : { plan: NO_PLAN, source: 'none' as const, cadence: null, currentPeriodEnd: null, cancelScheduled: false, trialing: false };

  const subscribed = isPaidPlan(entitlement.plan);
  const cadence = entitlement.cadence ?? 'monthly';
  const periodEndLabel = formatDate(entitlement.currentPeriodEnd);
  // Trial eligibility mirrors the checkout route: Standard only, never
  // trialed before, and not currently entitled via Apple (web checkout is
  // server-blocked in that case so a trial offer would be misleading).
  const trialEligible =
    !!profile && profile.trialUsedAt === null && entitlement.source !== 'apple';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            <Badge variant={entitlement.plan === 'premium' ? 'default' : 'muted'}>
              {planLabel(entitlement.plan)}
            </Badge>
            {entitlement.source === 'apple' && <Badge variant="muted">Billed via App Store</Badge>}
            {entitlement.source === 'stripe' && <Badge variant="muted">Billed via web</Badge>}
            <span>
              {!subscribed && 'Choose a plan below to start syncing historical email.'}
              {subscribed && entitlement.trialing && !entitlement.cancelScheduled && periodEndLabel &&
                `Free trial ends ${periodEndLabel} — you'll be charged then. Cancel anytime before to avoid the charge.`}
              {subscribed && entitlement.trialing && entitlement.cancelScheduled && periodEndLabel &&
                `Trial ends ${periodEndLabel}. You won't be charged.`}
              {subscribed && !entitlement.trialing && !entitlement.cancelScheduled && periodEndLabel &&
                `Renews on ${periodEndLabel}.`}
              {subscribed && !entitlement.trialing && entitlement.cancelScheduled && periodEndLabel &&
                `Cancels on ${periodEndLabel}. You keep access until then.`}
            </span>
          </CardDescription>
        </CardHeader>
        {subscribed && entitlement.source === 'stripe' && (
          <CardContent>
            <ManageSubscriptionButton />
          </CardContent>
        )}
        {subscribed && entitlement.source === 'apple' && (
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>
              Your subscription is managed by Apple. To change plan, cadence, or cancel, open{' '}
              <span className="font-medium text-foreground">
                Settings › Apple ID › Subscriptions
              </span>{' '}
              on your iPhone or iPad.
            </p>
            <p>
              <a
                href="https://apps.apple.com/account/subscriptions"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Manage on apps.apple.com
              </a>
            </p>
          </CardContent>
        )}
      </Card>

      <BillingPlans
        currentPlan={entitlement.plan}
        currentCadence={cadence}
        // Plan cards still render so users can see the lineup, but new
        // checkouts are blocked server-side when an Apple sub is active.
        // The flag flips the action button's copy to a heads-up message
        // instead of attempting a server round-trip that will 409.
        lockedByApple={entitlement.source === 'apple'}
        // Standard-only 7-day free trial. False when the user has already
        // consumed their trial (across either platform) or is Apple-locked.
        trialEligible={trialEligible}
      />

      <p className="text-xs text-muted-foreground">
        Prices in USD. Subscriptions renew {cadence === 'annual' ? 'annually' : 'monthly'} and can be cancelled anytime. Cancellation takes effect at the end of the current billing period and we don&apos;t issue refunds for partial periods — see our{' '}
        <a href="/refunds" className="underline">
          Refund Policy
        </a>
        .
      </p>
    </div>
  );
}
