ALTER TABLE "orders" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "orders_demo_idx" ON "orders" USING btree ("is_demo","created_at");