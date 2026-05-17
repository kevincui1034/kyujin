-- Apple App Store billing mirror on `users`. Parallels the Stripe columns
-- added in 0014. Source of truth for "what plan is this user on right now?"
-- moves to lib/entitlements.ts (derived from BOTH Stripe and Apple state);
-- users.plan becomes a denormalized cache that both webhooks write through
-- a shared recompute helper.
--
-- originalTransactionId is StoreKit's stable subscription identity (survives
-- renewals + upgrades within the same group), which is why it's unique and
-- not transactionId.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "apple_original_transaction_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "apple_product_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "apple_subscription_status" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "apple_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "apple_auto_renew_enabled" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "apple_environment" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_apple_original_transaction_id_unique" ON "users"("apple_original_transaction_id");
