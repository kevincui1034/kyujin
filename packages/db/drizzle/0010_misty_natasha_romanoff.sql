ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "default_app_sort" text DEFAULT 'lastEvent' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "default_app_range" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "default_app_dir" text DEFAULT 'desc' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "hide_statuses" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "theme" text DEFAULT 'system' NOT NULL;
