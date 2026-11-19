import "server-only";
import { and, asc, desc, eq, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { OrderStatus } from "@/db/schema";
import { DEFAULT_SIZES, type Product } from "@/lib/catalog";
import { activeOffers, bestPrice } from "@/lib/offers";

const { products, inventory, orders, orderItems, categories } = schema;

/** Statuses that count as real sales in analytics. */
export const soldStatuses: OrderStatus[] = ["paid", "packed", "shipped", "delivered"];

export type ProductRow = typeof products.$inferSelect;

/**
 * Turns product rows into storefront products: per-size stock (in the
 * category's size order) and today's price after offers.
 */
export async function hydrateProducts(rows: ProductRow[]): Promise<Product[]> {
  if (!rows.length) return [];
  const db = getDb();
  const ids = rows.map((r) => r.id);
  const names = [...new Set(rows.map((r) => r.category))];
  const [stock, cats, offers] = await Promise.all([
    db.select().from(inventory).where(inArray(inventory.productId, ids)),
    db
      .select({ name: categories.name, sizes: categories.sizes })
      .from(categories)
      .where(inArray(categories.name, names)),
    activeOffers(),
  ]);
  return rows.map((p) => {
    const own = stock.filter((v) => v.productId === p.id);
    const catSizes = cats.find((c) => c.name === p.category)?.sizes ?? DEFAULT_SIZES;
    // Category sizes first, then any older sizes that still hold stock.
    const sizes = [...catSizes, ...own.map((v) => v.size).filter((s) => !catSizes.includes(s))];
    const { price, offer } = bestPrice(p, offers);
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      gender: p.gender,
      tags: p.tags,
      price,
      basePrice: p.price,
      originalPrice: Math.max(p.originalPrice, p.price),
      offer,
      description: p.description,
      image: p.image,
      images: p.images.length ? p.images : [p.image],
      badge: p.badge,
      color: p.color,
      sizes,
      stock: Object.fromEntries(sizes.map((s) => [s, own.find((v) => v.size === s)?.quantity ?? 0])),
    };
  });
}

export type ProductQuery = {
  category?: string;
  q?: string;
  gender?: string;
  sort?: "featured" | "price-low" | "price-high" | "name" | "new";
  size?: string;
  inStock?: boolean;
  ids?: string[];
  page?: number;
  perPage?: number;
};

/** Filtered, sorted, paginated catalogue — all done in the database, so it scales. */
export async function queryProducts(q: ProductQuery) {
  const perPage = Math.min(Math.max(q.perPage ?? 12, 1), 48);
  const page = Math.max(q.page ?? 1, 1);
  const where: SQL[] = [eq(products.active, true)];
  if (q.category) where.push(eq(products.category, q.category));
  if (q.gender === "girls" || q.gender === "boys") {
    where.push(or(eq(products.gender, q.gender), eq(products.gender, "unisex"))!);
  }
  if (q.q) {
    // Escape LIKE wildcards so a search for "50%" matches literally.
    const term = q.q.replace(/[\\%_]/g, (c) => "\\" + c);
    where.push(
      or(
        ilike(products.name, `%${term}%`),
        ilike(products.category, `%${term}%`),
        sql`exists (select 1 from unnest(${products.tags}) t where t ilike ${"%" + term + "%"})`,
      )!,
    );
  }
  if (q.ids) where.push(q.ids.length ? inArray(products.id, q.ids) : sql`false`);
  if (q.size) {
    where.push(
      sql`exists (select 1 from ${inventory} v where v.product_id = ${products.id} and v.size = ${q.size} and v.quantity > 0)`,
    );
  } else if (q.inStock) {
    where.push(
      sql`exists (select 1 from ${inventory} v where v.product_id = ${products.id} and v.quantity > 0)`,
    );
  }
  const order = {
    featured: [asc(products.createdAt), asc(products.id)],
    new: [desc(products.createdAt), asc(products.id)],
    "price-low": [asc(products.price), asc(products.id)],
    "price-high": [desc(products.price), asc(products.id)],
    name: [asc(products.name), asc(products.id)],
  }[q.sort ?? "featured"];

  const db = getDb();
  const [[{ total }], rows] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(products)
      .where(and(...where)),
    db
      .select()
      .from(products)
      .where(and(...where))
      .orderBy(...order)
      .limit(perPage)
      .offset((page - 1) * perPage),
  ]);
  return {
    products: await hydrateProducts(rows),
    total,
    page,
    perPage,
    pages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export async function getProduct(id: string) {
  const rows = await getDb()
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.active, true)))
    .limit(1);
  return (await hydrateProducts(rows))[0] ?? null;
}

export async function relatedProducts(p: Product, limit = 4) {
  const rows = await getDb()
    .select()
    .from(products)
    .where(and(eq(products.active, true), eq(products.category, p.category), ne(products.id, p.id)))
    .orderBy(desc(products.createdAt))
    .limit(limit);
  return hydrateProducts(rows);
}

/** Every size used in the catalogue (for the shop size filter). */
export async function allSizes() {
  const rows = await getDb()
    .select({ sizes: categories.sizes })
    .from(categories)
    .where(eq(categories.active, true))
    .orderBy(asc(categories.sortOrder));
  return [...new Set(rows.flatMap((r) => r.sizes))];
}

/** Product counts per category, for navigation. */
export async function categoryCounts() {
  const rows = await getDb()
    .select({ category: products.category, count: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.active, true))
    .groupBy(products.category);
  return Object.fromEntries(rows.map((r) => [r.category, r.count])) as Record<string, number>;
}

export async function ordersForUser(userId: string) {
  const db = getDb();
  const list = await db
    .select()
    .from(orders)
    .where(and(eq(orders.userId, userId), sql`${orders.status} <> 'pending_payment'`))
    .orderBy(desc(orders.createdAt))
    .limit(50);
  const items = list.length
    ? await db
        .select()
        .from(orderItems)
        .where(
          inArray(
            orderItems.orderId,
            list.map((o) => o.id),
          ),
        )
    : [];
  return list.map((o) => ({ ...o, items: items.filter((i) => i.orderId === o.id) }));
}

/** One order with item photos (optionally only if it belongs to this account). */
export async function orderWithItems(orderId: string, userId?: string) {
  const db = getDb();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), userId ? eq(orders.userId, userId) : undefined))
    .limit(1);
  if (!order) return null;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const images = items.length
    ? await db
        .select({ id: products.id, image: products.image })
        .from(products)
        .where(
          inArray(
            products.id,
            items.map((i) => i.productId),
          ),
        )
    : [];
  return {
    ...order,
    items: items.map((i) => ({ ...i, image: images.find((p) => p.id === i.productId)?.image ?? "" })),
  };
}

/** A customer's own order (hidden while still awaiting payment). */
export async function orderForUser(userId: string, orderId: string) {
  const order = await orderWithItems(orderId, userId);
  return order && order.status !== "pending_payment" ? order : null;
}
