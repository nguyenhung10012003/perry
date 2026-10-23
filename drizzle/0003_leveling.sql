CREATE TABLE "level_role_rewards" (
	"guild_id" text NOT NULL,
	"level" integer NOT NULL,
	"role_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "level_role_rewards_pkey" PRIMARY KEY("guild_id","level"),
	CONSTRAINT "level_role_rewards_guild_role_unique" UNIQUE("guild_id","role_id"),
	CONSTRAINT "level_role_rewards_level_check" CHECK ("level_role_rewards"."level" between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "member_levels" (
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"username" text,
	"avatar" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_levels_pkey" PRIMARY KEY("guild_id","user_id"),
	CONSTRAINT "member_levels_xp_check" CHECK ("member_levels"."xp" between 0 and 2000000000),
	CONSTRAINT "member_levels_level_check" CHECK ("member_levels"."level" between 0 and 2000)
);
--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "leveling_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "xp_multiplier_percent" smallint DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "level_up_mode" text DEFAULT 'current' NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "level_up_channel_id" text;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "xp_ignored_channel_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "xp_ignored_role_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "level_reward_mode" text DEFAULT 'stack' NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "leaderboard_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "member_levels_guild_xp_idx" ON "member_levels" USING btree ("guild_id","xp" DESC NULLS LAST,"user_id");--> statement-breakpoint
ALTER TABLE "guild_settings" ADD CONSTRAINT "guild_settings_xp_multiplier_check" CHECK ("guild_settings"."xp_multiplier_percent" between 10 and 500);--> statement-breakpoint
ALTER TABLE "guild_settings" ADD CONSTRAINT "guild_settings_level_up_mode_check" CHECK ("guild_settings"."level_up_mode" in ('off', 'current', 'channel', 'dm'));--> statement-breakpoint
ALTER TABLE "guild_settings" ADD CONSTRAINT "guild_settings_level_reward_mode_check" CHECK ("guild_settings"."level_reward_mode" in ('stack', 'highest'));--> statement-breakpoint
ALTER TABLE "guild_settings" ADD CONSTRAINT "guild_settings_xp_ignored_channels_check" CHECK (cardinality("guild_settings"."xp_ignored_channel_ids") <= 50);--> statement-breakpoint
ALTER TABLE "guild_settings" ADD CONSTRAINT "guild_settings_xp_ignored_roles_check" CHECK (cardinality("guild_settings"."xp_ignored_role_ids") <= 50);