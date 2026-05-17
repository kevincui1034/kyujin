CREATE TABLE IF NOT EXISTS "application_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "action" text NOT NULL,
  "payload" jsonb NOT NULL,
  "reverted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "application_audit" ADD CONSTRAINT "application_audit_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "application_audit_user_idx" ON "application_audit" USING btree ("user_id","created_at");
