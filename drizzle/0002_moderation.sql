CREATE TABLE "mod_case_counters" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"last_case_number" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "mod_case_counters_last_check" CHECK ("mod_case_counters"."last_case_number" >= 0)
);
--> statement-breakpoint
CREATE TABLE "mod_cases" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mod_cases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"guild_id" text NOT NULL,
	"case_number" integer NOT NULL,
	"action" text NOT NULL,
	"target_id" text NOT NULL,
	"target_tag" text,
	"moderator_id" text NOT NULL,
	"moderator_tag" text,
	"reason" text,
	"duration_seconds" integer,
	"dm_sent" boolean DEFAULT false NOT NULL,
	"log_channel_id" text,
	"log_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mod_cases_guild_case_unique" UNIQUE("guild_id","case_number"),
	CONSTRAINT "mod_cases_action_check" CHECK ("mod_cases"."action" in ('ban', 'unban', 'kick', 'timeout', 'untimeout', 'warn')),
	CONSTRAINT "mod_cases_reason_check" CHECK ("mod_cases"."reason" is null or char_length("mod_cases"."reason") <= 512),
	CONSTRAINT "mod_cases_duration_check" CHECK ("mod_cases"."duration_seconds" is null or "mod_cases"."duration_seconds" between 1 and 2419200)
);
--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "mod_log_channel_id" text;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "mod_dm_target" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "mod_cases_guild_target_created_idx" ON "mod_cases" USING btree ("guild_id","target_id","created_at" DESC NULLS LAST);