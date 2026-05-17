-- Per-user LLM classifier call log. One row per generateObject() invocation
-- in the classifier (pre-filter / regex hits are not recorded). Backs the
-- monthly cap (apps/web/lib/plans.ts: monthlyClassifierCap) that bounds
-- widening-window backfill abuse on Premium.

CREATE TABLE IF NOT EXISTS "classifier_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classifier_usage" ADD CONSTRAINT "classifier_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "classifier_usage_user_created_idx" ON "classifier_usage" USING btree ("user_id","created_at");
