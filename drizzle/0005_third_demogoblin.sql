ALTER TABLE "sessions" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "paused_ms" integer DEFAULT 0 NOT NULL;