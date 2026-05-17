DROP INDEX IF EXISTS "applications_snoozed_idx";--> statement-breakpoint
ALTER TABLE "applications" DROP COLUMN IF EXISTS "snoozed_until";
