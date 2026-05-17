-- Free-form key/value bag for columns that arrived via CSV/XLSX import and
-- don't map to a Yume field (e.g. salary, location, recruiter). Stored as
-- jsonb so we can later filter / display without another migration.
--
-- Uses IF NOT EXISTS to match 0016_apple_billing's defensive pattern — the
-- drizzle-kit auto-generator drifts against Stripe/Apple columns on these
-- envs, so making each ADD COLUMN idempotent keeps the migration runnable
-- regardless of which prior migrations have already been registered.

ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "custom_fields" jsonb;
