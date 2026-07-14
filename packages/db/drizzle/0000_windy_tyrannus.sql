CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('plan.generate', 'plan.revise', 'plan.export', 'watch.price', 'kb.ingest', 'notify');--> statement-breakpoint
CREATE TYPE "public"."share_permission" AS ENUM('view', 'comment');--> statement-breakpoint
CREATE TYPE "public"."trip_role" AS ENUM('owner', 'editor', 'commenter', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."trip_status" AS ENUM('draft', 'generating', 'active', 'archived');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
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
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"detail" jsonb,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clarifier_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"question" text NOT NULL,
	"options" jsonb,
	"answer" jsonb,
	"asked_because" text,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edits_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"inferred_profile_delta" jsonb,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "job_type" NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"trip_id" uuid,
	"state_checkpoint" jsonb,
	"token_ledger" jsonb,
	"timings" jsonb,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"data" jsonb NOT NULL,
	"last_verified" date,
	"expires_at" date,
	"embedding" vector(768),
	"kb_version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_graphs" (
	"trip_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"graph" jsonb NOT NULL,
	"diff" jsonb,
	"parent_version" integer,
	"job_id" text,
	"critic_score" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_graphs_trip_id_version_pk" PRIMARY KEY("trip_id","version")
);
--> statement-breakpoint
CREATE TABLE "price_watches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target" jsonb NOT NULL,
	"last_price" real,
	"threshold" real,
	"channel" text DEFAULT 'email' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_cache" (
	"provider" text NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ttl_seconds" integer NOT NULL,
	CONSTRAINT "provider_cache_provider_request_hash_pk" PRIMARY KEY("provider","request_hash")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"token" text PRIMARY KEY NOT NULL,
	"trip_id" uuid NOT NULL,
	"permissions" "share_permission" DEFAULT 'view' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traveller_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"label" text DEFAULT 'default' NOT NULL,
	"profile" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_members" (
	"trip_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "trip_role" DEFAULT 'viewer' NOT NULL,
	CONSTRAINT "trip_members_trip_id_user_id_pk" PRIMARY KEY("trip_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"anonymous_session_id" text,
	"status" "trip_status" DEFAULT 'draft' NOT NULL,
	"active_profile_version" integer,
	"profile_id" uuid,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp with time zone,
	"image" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clarifier_log" ADD CONSTRAINT "clarifier_log_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edits_log" ADD CONSTRAINT "edits_log_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_graphs" ADD CONSTRAINT "plan_graphs_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_watches" ADD CONSTRAINT "price_watches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traveller_profiles" ADD CONSTRAINT "traveller_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_members" ADD CONSTRAINT "trip_members_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_members" ADD CONSTRAINT "trip_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_profile_id_traveller_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."traveller_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clarifier_log_trip_idx" ON "clarifier_log" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "edits_log_trip_idx" ON "edits_log" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "jobs_trip_idx" ON "jobs" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "kb_entities_kind_slug_idx" ON "kb_entities" USING btree ("kind","slug");--> statement-breakpoint
CREATE INDEX "kb_entities_kind_idx" ON "kb_entities" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "price_watches_user_idx" ON "price_watches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "share_links_trip_idx" ON "share_links" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "traveller_profiles_user_idx" ON "traveller_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trips_owner_idx" ON "trips" USING btree ("owner_id");