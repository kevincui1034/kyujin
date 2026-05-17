CREATE TABLE "classifier_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "apple_original_transaction_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "apple_product_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "apple_subscription_status" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "apple_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "apple_auto_renew_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "apple_environment" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "apple_in_intro_offer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_used_at" timestamp;--> statement-breakpoint
ALTER TABLE "classifier_usage" ADD CONSTRAINT "classifier_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "classifier_usage_user_created_idx" ON "classifier_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "applications_user_last_event_idx" ON "applications" USING btree ("user_id","last_event_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "applications_user_first_seen_idx" ON "applications" USING btree ("user_id","first_seen_at");--> statement-breakpoint
CREATE INDEX "email_user_app_received_idx" ON "email_messages" USING btree ("user_id","application_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_apple_original_transaction_id_unique" ON "users" USING btree ("apple_original_transaction_id");