ALTER TABLE "email_messages" ADD COLUMN IF NOT EXISTS "display_order" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_app_order_idx" ON "email_messages" USING btree ("application_id","display_order");
