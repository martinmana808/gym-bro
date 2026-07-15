-- New parent tables
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"src_workout_id" uuid
);
--> statement-breakpoint
CREATE TABLE "days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"default_rest_seconds" integer DEFAULT 90 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- New columns (nullable for backfill)
ALTER TABLE "exercises" ADD COLUMN "variation_id" uuid;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "lineage_id" uuid;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "section_name" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "superset_key" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "target_weight" real;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "day_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "variation_id" uuid;--> statement-breakpoint
ALTER TABLE "set_logs" ADD COLUMN "hit_target" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill: one program + day + Base variation per workout. day.id = workout.id.
INSERT INTO "programs" ("id", "user_id", "name", "created_at", "src_workout_id")
	SELECT gen_random_uuid(), "user_id", "name", "created_at", "id" FROM "workouts";--> statement-breakpoint
INSERT INTO "days" ("id", "program_id", "position", "name", "default_rest_seconds")
	SELECT w."id", p."id", 0, w."name", w."default_rest_seconds"
	FROM "workouts" w JOIN "programs" p ON p."src_workout_id" = w."id";--> statement-breakpoint
INSERT INTO "variations" ("id", "day_id", "position", "name", "created_at")
	SELECT gen_random_uuid(), w."id", 0, 'Base', now() FROM "workouts" w;--> statement-breakpoint
-- Backfill exercises: attach to the Base variation, derive superset_key from block,
-- fresh lineage, day-global position (block order then intra-block order).
UPDATE "exercises" e SET
	"variation_id" = v."id",
	"lineage_id" = gen_random_uuid(),
	"superset_key" = b."id"::text,
	"position" = b."position" * 1000 + e."position"
	FROM "blocks" b JOIN "variations" v ON v."day_id" = b."workout_id"
	WHERE e."block_id" = b."id";--> statement-breakpoint
-- Backfill sessions: point at their day + Base variation.
UPDATE "sessions" s SET "day_id" = s."workout_id", "variation_id" = v."id"
	FROM "variations" v WHERE v."day_id" = s."workout_id";--> statement-breakpoint
-- Enforce NOT NULL now that everything is backfilled.
ALTER TABLE "exercises" ALTER COLUMN "variation_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ALTER COLUMN "lineage_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "day_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "variation_id" SET NOT NULL;--> statement-breakpoint
-- Foreign keys.
ALTER TABLE "programs" ADD CONSTRAINT "programs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "days" ADD CONSTRAINT "days_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variations" ADD CONSTRAINT "variations_day_id_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_variation_id_variations_id_fk" FOREIGN KEY ("variation_id") REFERENCES "public"."variations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_day_id_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_variation_id_variations_id_fk" FOREIGN KEY ("variation_id") REFERENCES "public"."variations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Drop the old structure (dropping columns removes their FKs first).
ALTER TABLE "exercises" DROP COLUMN "block_id";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "workout_id";--> statement-breakpoint
DROP TABLE "blocks";--> statement-breakpoint
DROP TABLE "workouts";--> statement-breakpoint
ALTER TABLE "programs" DROP COLUMN "src_workout_id";
