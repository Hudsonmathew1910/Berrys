ALTER TABLE "order_refunds" ADD COLUMN "gateway_status" text DEFAULT 'initiated' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_refunds" ADD COLUMN "processed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_refunds" ADD COLUMN "failure_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Refunds recorded before tracking existed are treated as complete.
UPDATE "order_refunds" SET "gateway_status" = 'processed', "processed_at" = "created_at" WHERE "status" = 'done';
