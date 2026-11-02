ALTER TABLE "ci_installations" ADD COLUMN "workspace_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "pr_url" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD CONSTRAINT "ci_installations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ci_installations_workspace_repo_uq" ON "ci_installations" USING btree ("workspace_id","repo");