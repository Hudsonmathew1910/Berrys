ALTER TABLE "offers" ADD COLUMN "product_id" text;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "excluded" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "stacked" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Existing offers came off the selling price. Keep exactly that ("Apply both") for products that
-- are about to get their own sale price, so no customer price changes with this migration.
UPDATE "offers" o SET "stacked" = coalesce((
  SELECT array_agg(p.id) FROM "products" p
  WHERE p.original_price > p.price
    AND (o.scope = 'all'
      OR (o.scope = 'category' AND p.category = ANY (o.targets))
      OR (o.scope = 'product' AND p.id = ANY (o.targets)))
), '{}'::text[]);--> statement-breakpoint
-- A selling price below the MRP becomes the product's own sale price (an offer), with no end date.
INSERT INTO "offers" ("name", "type", "value", "scope", "targets", "starts_at", "ends_at", "active", "product_id")
SELECT 'Special price', 'price', p.price, 'product', ARRAY[p.id], p.created_at, NULL, true, p.id
FROM "products" p
WHERE p.original_price > p.price;--> statement-breakpoint
-- The product's own price is now the MRP.
UPDATE "products" SET "price" = greatest("original_price", "price");--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "original_price";--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_product_id_unique" UNIQUE("product_id");
