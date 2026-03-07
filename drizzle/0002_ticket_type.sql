CREATE TYPE "public"."ticket_type" AS ENUM('bug', 'manual support', 'enhancement', 'report request');--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "ticket_type" "ticket_type" DEFAULT 'manual support' NOT NULL;
