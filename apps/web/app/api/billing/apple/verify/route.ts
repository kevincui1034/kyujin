import { NextResponse, type NextRequest } from 'next/server';
import { eq, and, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@kyujin/db/client';
import { users } from '@kyujin/db/schema';
import { getAuthUserId } from '@/lib/api-auth';
import {
  Environment,
  appleProductConfigFor,
  getAppleApi,
  getVerifier,
  type JWSTransactionDecodedPayload,
} from '@/lib/apple';
import { activeEntitlementSource, recomputeUserPlan } from '@/lib/entitlements';
import { apiError } from '@/lib/api-errors';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  // The `jwsRepresentation` field on a StoreKit2 Transaction. The iOS app
  // POSTs this string verbatim after Apple finishes processing the purchase.
  signedTransaction: z.string().min(20),
});

// POST /api/billing/apple/verify — iOS clients call this after StoreKit
// confirms a subscription purchase. We:
//   1. Verify the JWS against Apple's root cert chain (proves Apple signed it)
//   2. Confirm the bundleId matches our app (proves it's our transaction)
//   3. Cross-check current status via App Store Server API (proves it's
//      still active; the device-supplied transaction is a snapshot from
//      purchase time and could be stale)
//   4. Reject if the user already has a Stripe subscription (avoids
//      double-billing — see the comment in the matching path on the
//      Stripe checkout route)
//   5. Reject if this originalTransactionId is already attached to a
//      different user (someone trying to bind another user's Apple sub)
//   6. Persist + recompute plan
//
// Auth: same bearer-or-cookie pattern as the rest of the iOS-facing API.
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  let decoded: JWSTransactionDecodedPayload;
  try {
    decoded = await getVerifier().verifyAndDecodeTransaction(parsed.data.signedTransaction);
  } catch (err) {
    return apiError('invalid_signature', { cause: err });
  }

  // Reject anything that isn't an active auto-renewable subscription —
  // consumables, non-renewing subs, and refunded transactions shouldn't
  // entitle anyone.
  if (!decoded.productId || !decoded.originalTransactionId) {
    return NextResponse.json({ error: 'invalid_transaction' }, { status: 400 });
  }
  const productConfig = appleProductConfigFor(decoded.productId);
  if (!productConfig) {
    return NextResponse.json(
      { error: 'unknown_product', productId: decoded.productId },
      { status: 400 },
    );
  }

  // Cross-platform guard. Active Stripe subscriptions block Apple purchases
  // server-side; the iOS UI should already have hidden the Subscribe button,
  // but a stale local cache could still let the user trigger StoreKit.
  // Apple has already charged the card by this point — surface the conflict
  // clearly so the user can refund through App Store Settings.
  const existingSource = await activeEntitlementSource(userId);
  if (existingSource === 'stripe') {
    return NextResponse.json(
      {
        error: 'stripe_subscription_active',
        message:
          'You already subscribe to Kyujin on the web. Cancel that subscription first, then re-subscribe in the app. Apple will refund the duplicate charge if you contact Support.',
      },
      { status: 409 },
    );
  }

  // The originalTransactionId is unique per Apple subscription. If it's
  // already attached to a different user row, someone is trying to claim
  // another account's sub — refuse. The unique index would catch this at
  // INSERT time, but the explicit check yields a better error.
  const collision = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.appleOriginalTransactionId, decoded.originalTransactionId),
        ne(users.id, userId),
      ),
    )
    .limit(1);
  if (collision.length > 0) {
    return NextResponse.json({ error: 'transaction_belongs_to_other_user' }, { status: 409 });
  }

  // Refresh status from Apple's API rather than trusting the JWS payload
  // alone — the device-side transaction is a snapshot from purchase time
  // and may be stale (e.g. user already refunded). The API call returns
  // the latest renewal info, which is what should drive entitlement.
  let status: string = 'active';
  let expiresAt: Date | null = decoded.expiresDate ? new Date(decoded.expiresDate) : null;
  let autoRenew = true;
  // offerType on Apple's transaction: 1 = INTRODUCTORY (the free-trial
  // mechanism), 2 = PROMOTIONAL, 3 = SUBSCRIPTION_OFFER_CODE. Only intro
  // means "trialing" for entitlement purposes. Default to the device JWS
  // value and overwrite from the canonical server-side transaction below.
  let isIntroOffer = decoded.offerType === 1;
  try {
    const api = getAppleApi();
    const statusResp = await api.getAllSubscriptionStatuses(decoded.originalTransactionId);
    const latest = statusResp.data?.[0]?.lastTransactions?.[0];
    if (latest) {
      // Apple's Status enum: 1=active, 2=expired, 3=in_billing_retry,
      // 4=in_grace_period, 5=revoked. Map to our string-typed mirror.
      status = appleStatusToString(latest.status);
      if (latest.signedRenewalInfo) {
        const renewal = await getVerifier().verifyAndDecodeRenewalInfo(latest.signedRenewalInfo);
        autoRenew = renewal.autoRenewStatus === 1;
      }
      if (latest.signedTransactionInfo) {
        const tx = await getVerifier().verifyAndDecodeTransaction(latest.signedTransactionInfo);
        if (tx.expiresDate) expiresAt = new Date(tx.expiresDate);
        isIntroOffer = tx.offerType === 1;
      }
    }
  } catch (err) {
    // If Apple's API is down, trust the JWS payload we already verified.
    // Logged so we know to investigate, but not fatal — the user just paid,
    // we should entitle them.
    log.warn({
      kind: 'billing.apple.verify.status_refresh_failed',
      userId,
      cause: err instanceof Error ? err.message : String(err),
    });
  }

  // Cross-platform trial stamp. Only set on the first intro-offer transaction
  // we see; subsequent renewals don't touch it. Apple already enforces one
  // intro per Apple ID per subscription group on its own — this column
  // additionally blocks the user from claiming a Stripe trial on the web.
  await db
    .update(users)
    .set({
      appleOriginalTransactionId: decoded.originalTransactionId,
      appleProductId: decoded.productId,
      appleSubscriptionStatus: status,
      appleExpiresAt: expiresAt,
      appleAutoRenewEnabled: autoRenew,
      appleEnvironment: decoded.environment === Environment.PRODUCTION ? 'Production' : 'Sandbox',
      appleInIntroOffer: isIntroOffer,
      ...(isIntroOffer
        ? { trialUsedAt: sql`coalesce(${users.trialUsedAt}, now())` }
        : {}),
    })
    .where(eq(users.id, userId));

  const entitlement = await recomputeUserPlan(userId);
  return NextResponse.json({ entitlement });
}

function appleStatusToString(status: number | undefined | null): string {
  switch (status) {
    case 1:
      return 'active';
    case 2:
      return 'expired';
    case 3:
      return 'in_billing_retry';
    case 4:
      return 'in_grace_period';
    case 5:
      return 'revoked';
    default:
      return 'unknown';
  }
}
