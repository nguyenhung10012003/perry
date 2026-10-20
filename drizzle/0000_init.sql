CREATE TABLE "guild_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"dj_role_id" text,
	"default_volume" smallint DEFAULT 100 NOT NULL,
	"twenty_four_seven" boolean DEFAULT false NOT NULL,
	"autoplay_enabled" boolean DEFAULT false NOT NULL,
	"autoplay_mode" text DEFAULT 'related' NOT NULL,
	"default_text_channel_id" text,
	"default_voice_channel_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guild_settings_default_volume_check" CHECK ("guild_settings"."default_volume" between 0 and 150),
	CONSTRAINT "guild_settings_autoplay_mode_check" CHECK ("guild_settings"."autoplay_mode" in ('related', 'seed'))
);
--> statement-breakpoint
CREATE TABLE "play_history" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "play_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"guild_id" text NOT NULL,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL,
	"identifier" text,
	"source_name" text,
	"title" text,
	"author" text,
	"duration_ms" integer,
	"requester_id" text,
	"discovery_provider" text
);
--> statement-breakpoint
CREATE TABLE "playlist_tracks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "playlist_tracks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"playlist_id" integer NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"uri" text,
	"identifier" text,
	"source_name" text,
	"duration_ms" integer,
	"added_by" text
);
--> statement-breakpoint
CREATE TABLE "playlists" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "playlists_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"owner_type" text NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playlists_owner_name_unique" UNIQUE("owner_type","owner_id","name"),
	CONSTRAINT "playlists_owner_type_check" CHECK ("playlists"."owner_type" in ('user', 'guild'))
);
--> statement-breakpoint
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "play_history_guild_played_at_idx" ON "play_history" USING btree ("guild_id","played_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "playlist_tracks_playlist_position_idx" ON "playlist_tracks" USING btree ("playlist_id","position");