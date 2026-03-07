CREATE TABLE "ticket_git_environments" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"base_environment_id" text NOT NULL,
	"dev_branch" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_git_environments" ADD CONSTRAINT "ticket_git_environments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ticket_git_environments" ADD CONSTRAINT "ticket_git_environments_base_environment_id_environments_environment_key_fk" FOREIGN KEY ("base_environment_id") REFERENCES "public"."environments"("environment_key") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_git_environments_ticket_id_unique" ON "ticket_git_environments" USING btree ("ticket_id");
