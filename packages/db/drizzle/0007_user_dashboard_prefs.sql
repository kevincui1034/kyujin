ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "application_goal" integer NOT NULL DEFAULT 50;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dashboard_view" text NOT NULL DEFAULT 'flow';
