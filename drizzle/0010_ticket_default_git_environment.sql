ALTER TABLE "tickets"
ADD COLUMN "default_git_environment_id" integer;
--> statement-breakpoint
ALTER TABLE "tickets"
ADD CONSTRAINT "tickets_default_git_environment_id_ticket_git_environments_id_fk"
FOREIGN KEY ("default_git_environment_id") REFERENCES "public"."ticket_git_environments"("id")
ON DELETE set null ON UPDATE no action;
