CREATE TABLE "nylas_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"email_address" text NOT NULL,
	"grant_id" text NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"needs_reauth" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nylas_connections" ADD CONSTRAINT "nylas_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nylas_user_email_unique" ON "nylas_connections" USING btree ("user_id","email_address");--> statement-breakpoint
CREATE UNIQUE INDEX "nylas_grant_unique" ON "nylas_connections" USING btree ("grant_id");--> statement-breakpoint
CREATE INDEX "nylas_email_idx" ON "nylas_connections" USING btree ("email_address");