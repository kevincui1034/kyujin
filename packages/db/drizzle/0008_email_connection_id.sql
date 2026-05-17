ALTER TABLE "email_messages" ADD COLUMN IF NOT EXISTS "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_connection_id_gmail_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."gmail_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_connection_idx" ON "email_messages" USING btree ("connection_id");--> statement-breakpoint
-- Backfill connection_id from backfill_queue for already-processed rows
UPDATE "email_messages" em
SET "connection_id" = bq."connection_id"
FROM "backfill_queue" bq
WHERE em."user_id" = bq."user_id"
  AND em."gmail_message_id" = bq."gmail_message_id"
  AND em."connection_id" IS NULL
  AND bq."connection_id" IS NOT NULL;--> statement-breakpoint
-- Pre-multi-inbox: every user had exactly one Gmail connection, so any still
-- unattributed email belongs to the earliest connection that user added.
UPDATE "email_messages" em
SET "connection_id" = fc.id
FROM (
  SELECT DISTINCT ON (user_id) user_id, id
  FROM "gmail_connections"
  ORDER BY user_id, created_at ASC
) fc
WHERE em."user_id" = fc.user_id
  AND em."connection_id" IS NULL;
