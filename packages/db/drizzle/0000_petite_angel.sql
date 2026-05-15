CREATE TYPE "public"."application_status" AS ENUM('applied', 'no_response', 'interview', 'rejected', 'accepted', 'obtained');--> statement-breakpoint
CREATE TYPE "public"."classification_method" AS ENUM('filter', 'regex', 'cache', 'llm', 'manual');--> statement-breakpoint
CREATE TYPE "public"."queue_state" AS ENUM('pending', 'processing', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"company" text NOT NULL,
	"role" text,
	"source_domain" text,
	"status" "application_status" DEFAULT 'applied' NOT NULL,
	"first_seen_at" timestamp NOT NULL,
	"last_event_at" timestamp NOT NULL,
	"ghosted_at" timestamp,
	"manual_override" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backfill_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"gmail_message_id" text NOT NULL,
	"state" "queue_state" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"enqueued_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "classifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_message_id" uuid NOT NULL,
	"label" "application_status" NOT NULL,
	"confidence" real,
	"method" "classification_method" NOT NULL,
	"model" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"company" text,
	"role" text,
	"raw" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"gmail_message_id" text NOT NULL,
	"gmail_thread_id" text NOT NULL,
	"from_address" text NOT NULL,
	"from_domain" text NOT NULL,
	"subject" text NOT NULL,
	"snippet" text,
	"received_at" timestamp NOT NULL,
	"classified_at" timestamp,
	"application_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gmail_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"email_address" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"scope" text NOT NULL,
	"history_id" bigint,
	"watch_expiration" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_cache" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"sender_domain" text NOT NULL,
	"subject_pattern" text NOT NULL,
	"label" "application_status" NOT NULL,
	"hits" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backfill_queue" ADD CONSTRAINT "backfill_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classifications" ADD CONSTRAINT "classifications_email_message_id_email_messages_id_fk" FOREIGN KEY ("email_message_id") REFERENCES "public"."email_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gmail_connections" ADD CONSTRAINT "gmail_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_user_status_idx" ON "applications" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_user_company_role_unique" ON "applications" USING btree ("user_id","company","role");--> statement-breakpoint
CREATE UNIQUE INDEX "queue_user_msg_unique" ON "backfill_queue" USING btree ("user_id","gmail_message_id");--> statement-breakpoint
CREATE INDEX "queue_state_idx" ON "backfill_queue" USING btree ("state","enqueued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_user_msg_unique" ON "email_messages" USING btree ("user_id","gmail_message_id");--> statement-breakpoint
CREATE INDEX "email_thread_idx" ON "email_messages" USING btree ("gmail_thread_id");--> statement-breakpoint
CREATE INDEX "email_received_idx" ON "email_messages" USING btree ("user_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "gmail_user_email_unique" ON "gmail_connections" USING btree ("user_id","email_address");--> statement-breakpoint
CREATE INDEX "gmail_email_idx" ON "gmail_connections" USING btree ("email_address");--> statement-breakpoint
CREATE INDEX "template_domain_idx" ON "template_cache" USING btree ("sender_domain");