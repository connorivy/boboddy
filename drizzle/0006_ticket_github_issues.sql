CREATE TABLE "ticket_github_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"github_issue_number" integer NOT NULL,
	"github_issue_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_github_issues" ADD CONSTRAINT "ticket_github_issues_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_github_issues_ticket_id_unique" ON "ticket_github_issues" USING btree ("ticket_id");
