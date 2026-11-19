CREATE INDEX "dashboard_sessions_staff_idx" ON "dashboard_sessions" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "order_items_product_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "orders_paid_idx" ON "orders" USING btree ("paid_at");--> statement-breakpoint
CREATE INDEX "orders_email_status_idx" ON "orders" USING btree ("email","status");--> statement-breakpoint
CREATE INDEX "products_active_category_idx" ON "products" USING btree ("active","category");--> statement-breakpoint
CREATE INDEX "products_created_idx" ON "products" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "products_updated_idx" ON "products" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "rate_limits_window_idx" ON "rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "stock_movements_order_idx" ON "stock_movements" USING btree ("order_id");--> statement-breakpoint
-- Defence in depth: this app only talks to Postgres directly (server-side).
-- Supabase's public Data API roles (anon / authenticated) get no access to
-- the store's tables at all, on top of RLS-with-no-policies. Also for future tables.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
  END IF;
END $$;
