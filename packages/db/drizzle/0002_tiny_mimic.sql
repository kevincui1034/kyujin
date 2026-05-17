CREATE TYPE "public"."sender_rule_type" AS ENUM('allow', 'block');--> statement-breakpoint
CREATE TABLE "user_sender_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"domain" text NOT NULL,
	"type" "sender_rule_type" NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_sender_rules" ADD CONSTRAINT "user_sender_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_sender_rules_user_domain_type_unique" ON "user_sender_rules" USING btree ("user_id","domain","type");--> statement-breakpoint
CREATE INDEX "user_sender_rules_user_idx" ON "user_sender_rules" USING btree ("user_id");