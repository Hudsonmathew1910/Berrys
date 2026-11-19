CREATE TABLE "error_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"message" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"path" text DEFAULT '' NOT NULL,
	"ref" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "error_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staff_members" ADD COLUMN "notify_orders" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_members" ADD COLUMN "reset_code_hash" text;--> statement-breakpoint
ALTER TABLE "staff_members" ADD COLUMN "reset_code_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_members" ADD COLUMN "reset_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "error_logs_created_idx" ON "error_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "error_logs_source_idx" ON "error_logs" USING btree ("source");