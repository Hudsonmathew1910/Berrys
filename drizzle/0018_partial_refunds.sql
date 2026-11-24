CREATE TABLE "order_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" text NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"razorpay_refund_id" text,
	"request_id" uuid,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_refunds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD COLUMN "payout_error" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_request_id_refund_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."refund_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_refunds_order_idx" ON "order_refunds" USING btree ("order_id");--> statement-breakpoint
-- Orders refunded before part refunds existed were refunded in full: record that.
UPDATE "orders" SET "refunded_amount" = "total" WHERE "status" = 'refunded';--> statement-breakpoint
INSERT INTO "order_refunds" ("order_id", "amount", "status", "razorpay_refund_id", "reason", "actor", "created_at")
SELECT "id", "total", 'done', "refund_id", 'Full refund', 'before part refunds', coalesce("refunded_at", now())
FROM "orders" WHERE "status" = 'refunded' AND "refund_id" IS NOT NULL;
