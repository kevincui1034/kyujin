import { NextResponse, type NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { users } from '@kyujin/db/schema';
import {
  Environment,
  getVerifier,
  type ResponseBodyV2DecodedPayload,
} from '@/lib/apple';
import { recomputeUserPlan } from '@/lib/entitlements';
import { apiError } from '@/lib/api-errors';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/billing/apple/webhook — Apple App Store Server Notifications V2.
// Apple POSTs a single signed JWS field ({"signedPayload": "..."}). The SDK
// verifies the JWS chain against Apple's root cert + decodes. We map each
// notificationType onto a column update, then defer to recomputeUserPlan to
// re-derive `users.plan` from BOTH Stripe and Apple state.
//
// Notification types we treat as state-changing for entitlement purposes:
//   - SUBSCRIBED, DID_RENEW, DID_CHANGE_RENEWAL_PREF, DID_CHANGE_RENEWAL_STATUS:
//       Refresh status + product + expires + auto-renew off the embedded
//       transaction/renewal info.
//   - EXPIRED, GRACE_PERIOD_EXPIRED, REVOKE, REFUND:
//       Flip status to the corresponding non-entitling state.
//   - TEST: Apple's sanity-check ping. Verify-only, no DB writes.
//   - Everything else (DID_FAIL_TO_RENEW, PRICE_INCREASE, etc.) currently
//       falls into the refresh path. Adding a special case is preferable to
//       silent drops if behavior needs to change.
//
// Ack with 200 as long as the signature verifies and we processed it
// without throwing. Apple retries non-2xx for up to 5 days, which would
// flood us with the same event during an outage.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { signedPayload?: string } | null;
  if (!body?.signedPayload) {
    return NextResponse.json({ error: 'no_signed_payload' }, { status: 400 });
  }

  let decoded: ResponseBodyV2DecodedPayload;
  try {
    decoded = await getVerifier().verifyAndDecodeNotification(body.signedPayload);
  } catch (err) {
    return apiError('invalid_signature', { cause: err });
  }

  try {
    await handleNotification(decoded);
  } catch (err) {
    // Log but ack — see note above about retry storms.
    log.error({
      kind: 'billing.apple.handler_failed',
      notificationType: decoded.notificationType,
      cause: err,
    });
  }
  return NextResponse.json({ received: true });
}

async function handleNotification(payload: ResponseBodyV2DecodedPayload): Promise<void> {
  if (payload.notificationType === 'TEST') return;
  if (!payload.data?.signedTransactionInfo) return;

  // Both signed sub-fields verify against the same root chain. Decoding
  // them gives us the canonical productId, originalTransactionId, expiry
  // date, environment, and auto-renew preference for this event.
  const verifier = getVerifier();
  const tx = await verifier.verifyAndDecodeTransaction(payload.data.signedTransactionInfo);
  const renewal = payload.data.signedRenewalInfo
    ? await verifier.verifyAndDecodeRenewalInfo(payload.data.signedRenewalInfo)
    : null;

  if (!tx.originalTransactionId) return;

  // Match the user via the originalTransactionId attached during /verify.
  // Users who buy on iOS without ever calling /verify (e.g. before the
  // app's first connect) won't appear here; the next /verify call will
  // backfill from Apple's status API.
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.appleOriginalTransactionId, tx.originalTransactionId))
    .limit(1);
  if (!user) {
    log.warn({
      kind: 'billing.apple.user_not_found',
      originalTransactionId: tx.originalTransactionId,
      notificationType: payload.notificationType,
    });
    return;
  }

  const status = statusForNotification(payload.notificationType ?? '');
  const expiresAt = tx.expiresDate ? new Date(tx.expiresDate) : null;
  // autoRenewStatus: 0 = off (cancel scheduled), 1 = on.
  const autoRenew = renewal ? renewal.autoRenewStatus === 1 : true;
  // offerType 1 = INTRODUCTORY (Apple's free-trial mechanism). Any other
  // value — or its absence on a DID_RENEW where the user has converted
  // from the trial to a paid period — flips the flag back to false.
  const isIntroOffer = tx.offerType === 1;

  await db
    .update(users)
    .set({
      // productId may move during a DID_CHANGE_RENEWAL_PREF (plan switch),
      // so always update it from the latest transaction.
      appleProductId: tx.productId ?? null,
      appleSubscriptionStatus: status,
      appleExpiresAt: expiresAt,
      appleAutoRenewEnabled: autoRenew,
      appleEnvironment: tx.environment === Environment.PRODUCTION ? 'Production' : 'Sandbox',
      appleInIntroOffer: isIntroOffer,
      // Stamp trialUsedAt the first time we see an intro-offer transaction
      // from any platform. Stays set forever after — see the matching
      // comment in apps/web/app/api/billing/webhook/route.ts.
      ...(isIntroOffer
        ? { trialUsedAt: sql`coalesce(${users.trialUsedAt}, now())` }
        : {}),
    })
    .where(eq(users.id, user.id));

  await recomputeUserPlan(user.id);
  log.info({
    kind: 'billing.apple.notification_applied',
    userId: user.id,
    notificationType: payload.notificationType,
    status,
    productId: tx.productId ?? null,
  });
}

// Map Apple's notificationType onto the apple_subscription_status string.
// Statuses match what /verify writes so the entitlement derivation only has
// to know about one vocabulary.
function statusForNotification(type: string): string {
  switch (type) {
    case 'EXPIRED':
    case 'GRACE_PERIOD_EXPIRED':
      return 'expired';
    case 'REVOKE':
      return 'revoked';
    case 'REFUND':
      // A refund tears down entitlement immediately even if the period
      // end is in the future.
      return 'revoked';
    case 'DID_FAIL_TO_RENEW':
      // Apple keeps the sub in billing retry for up to 60 days; entitlement
      // continues until the eventual EXPIRED / GRACE_PERIOD_EXPIRED event.
      return 'in_billing_retry';
    case 'SUBSCRIBED':
    case 'DID_RENEW':
    case 'DID_CHANGE_RENEWAL_PREF':
    case 'DID_CHANGE_RENEWAL_STATUS':
    case 'OFFER_REDEEMED':
    case 'RENEWAL_EXTENDED':
    case 'RENEWAL_EXTENSION':
    case 'REFUND_REVERSED':
    case 'PRICE_INCREASE':
    default:
      return 'active';
  }
}
