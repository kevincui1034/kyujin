-- Stripe Customer + Subscription mirror on `users`. The application source
-- of truth for "what plan does the user have right now?" is still
-- `users.plan` (free / standard / premium) — these columns are how the
-- webhook tracks renewals, cancellations, and which Stripe Price ID maps to
-- the current plan. Lazy-create: a Customer/Subscription is only written
-- after the user runs through Checkout the first time.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_subscription_status" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_price_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_current_period_end" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_cancel_at_period_end" boolean NOT NULL DEFAULT false;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_stripe_customer_id_unique" ON "users"("stripe_customer_id");
