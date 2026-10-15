ALTER TABLE "jobs" ADD COLUMN "max_attempts" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "last_retry_at" timestamp with time zone;