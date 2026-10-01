CREATE TABLE "convention_scans" (
	"repo_id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"sampled_file_count" integer DEFAULT 0 NOT NULL,
	"candidate_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "evidence_start_line" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "evidence_end_line" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "convention_scans" ADD CONSTRAINT "convention_scans_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conventions" DROP COLUMN "accepted";