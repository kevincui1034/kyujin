-- Tracks the first time we observed an entitling trial for the user, across
-- either platform. The checkout route (Stripe) and verify route (Apple) read
-- this to decide whether to offer the 7-day trial again — once set, no.
--
-- Apple enforces intro-offer eligibility on its own per Apple ID, so the
-- Apple side mostly stamps this for the cross-platform case: a user who
-- trialed on the web then later subscribes on iOS doesn't get a second
-- trial when they come back to the web.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trial_used_at" timestamp;--> statement-breakpoint
-- Mirrors Apple's "transaction is an introductory offer" signal. Set by
-- /api/billing/apple/verify and the V2 notification webhook when the latest
-- transaction's offerType resolves to 1 (Introductory). Cleared on the next
-- non-intro transaction (DID_RENEW). Drives the trialing flag in the
-- entitlement derivation on the iOS side.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "apple_in_intro_offer" boolean NOT NULL DEFAULT false;
