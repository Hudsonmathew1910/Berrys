CREATE TABLE "email_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT '' NOT NULL,
	"ok" boolean NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_sends" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staff_members" ALTER COLUMN "notify_orders" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "staff_members" ADD COLUMN "access_mode" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
CREATE INDEX "email_sends_sent_idx" ON "email_sends" USING btree ("sent_at");--> statement-breakpoint
UPDATE "staff_members" SET "access_mode" = 'full' WHERE "role" = 'admin';--> statement-breakpoint
UPDATE "staff_members" SET "permissions" = array_append("permissions", 'delete_categories') WHERE "role" = 'staff' AND 'categories' = ANY("permissions") AND NOT 'delete_categories' = ANY("permissions");
