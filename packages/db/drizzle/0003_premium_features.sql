ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "snoozed_until" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "applications_snoozed_idx" ON "applications" USING btree ("snoozed_until");--> statement-breakpoint
ALTER TABLE "backfill_queue" ADD COLUMN IF NOT EXISTS "connection_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "backfill_queue" ADD CONSTRAINT "backfill_queue_connection_id_gmail_connections_id_fk"
    FOREIGN KEY ("connection_id") REFERENCES "public"."gmail_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
