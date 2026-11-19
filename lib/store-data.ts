import "server-only";
import { and, asc, desc, eq, ilike, inArray, ne, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Viewer } from "@/lib/auth";
import { HttpError } from "@/lib/http-error";
import { seedProducts, sizes, type Product } from "@/lib/catalog";
import type { OrderStatus } from "@/db/schema";
import type { ProductInput } from "@/lib/validation";

const { products, inventory, orders, orderItems, admins } = schema;

/** Statuses that count as real sales in analytics. */
export const soldStatuses: OrderStatus[] = ["paid", "packed", "shipped", "delivered"];

type ProductRow = typeof products.$inferSelect;

/** Attaches per-size stock to product rows (one inventory query for the whole set). */
async function withStock(rows: ProductRow[]): Promise<Product[]> {
  if (!rows.length) return [];
  const stock = await getDb()
    .select()
    .from(inventory)
    .where(
      inArray(
        inventory.productId,
        rows.map((r) => r.id),
      ),
    );
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.price,
    originalPrice: p.originalPrice,
    description: p.description,
    image: p.image,
    badge: p.badge,
    color: p.color,
    stock: Object.fromEntries(
      sizes.map((s) => [s, stock.find((v) => v.productId === p.id && v.size === s)?.quantity ?? 0]),
    ),
  }));
}

/** Every active product (admin workspace). */
export async function listProducts(): Promise<Product[]> {
  const rows = await getDb()
    .select()
    .from(products)
    .where(eq(products.active, true))
    .orderBy(products.createdAt, products.id);
  return withStock(rows);
}

export type ProductQuery = {
  category?: string;
  q?: string;
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
  if (q.q) {
    // Escape LIKE wildcards so a search for "50%" matches literally.
    const term = q.q.replace(/[\\%_]/g, (c) => "\\" + c);
    where.push(ilike(products.name, `%${term}%`));
  }
  if (q.ids) where.push(q.ids.length ? inArray(products.id, q.ids) : sql`false`);
  if (q.size && (sizes as readonly string[]).includes(q.size)) {
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
    products: await withStock(rows),
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
  return (await withStock(rows))[0] ?? null;
}

export async function relatedProducts(p: Product, limit = 4) {
  const rows = await getDb()
    .select()
    .from(products)
    .where(and(eq(products.active, true), eq(products.category, p.category), ne(products.id, p.id)))
    .orderBy(desc(products.createdAt))
    .limit(limit);
  return withStock(rows);
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

export async function saveProduct(input: ProductInput) {
  const id = input.id || "berry-" + crypto.randomUUID();
  await getDb().transaction(async (tx) => {
    const values = {
      name: input.name,
      category: input.category,
      price: input.price,
      originalPrice: input.originalPrice,
      description: input.description,
      image: input.image,
      badge: input.badge.trim().toUpperCase(),
      color: input.color,
      active: true,
      updatedAt: new Date(),
    };
    await tx
      .insert(products)
      .values({ id, ...values })
      .onConflictDoUpdate({ target: products.id, set: values });
    for (const size of sizes) {
      await tx
        .insert(inventory)
        .values({ productId: id, size, quantity: input.stock[size] })
        .onConflictDoUpdate({
          target: [inventory.productId, inventory.size],
          set: { quantity: input.stock[size] },
        });
    }
  });
  return id;
}

/** Soft delete: hides the product but keeps order history intact. */
export async function deactivateProduct(id: string) {
  await getDb().update(products).set({ active: false, updatedAt: new Date() }).where(eq(products.id, id));
}

/**
 * One-time owner setup: registers the first admin and loads the sample
 * catalogue. An advisory lock stops two simultaneous setup requests racing.
 */
export async function setupOwner(viewer: NonNullable<Viewer>) {
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(4242)`);
    const existing = await tx.select({ id: admins.userId }).from(admins).limit(1);
    if (existing.length) throw new HttpError(409, "The owner has already been registered.");
    await tx.insert(admins).values({ userId: viewer.userId, email: viewer.email ?? "" });
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(products);
    if (count > 0) return; // keep any catalogue that already exists
    for (const p of seedProducts) {
      const { stock, ...product } = p;
      await tx.insert(products).values(product);
      await tx
        .insert(inventory)
        .values(sizes.map((size) => ({ productId: p.id, size, quantity: stock[size] })));
    }
  });
}

export async function adminOverview() {
  const db = getDb();
  const [recentOrders, ranking] = await Promise.all([
    db.select().from(orders).orderBy(desc(orders.createdAt)).limit(100),
    db
      .select({
        category: orderItems.category,
        units: sql<number>`sum(${orderItems.quantity})::int`,
        revenue: sql<number>`sum(${orderItems.quantity} * ${orderItems.price})::int`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(inArray(orders.status, soldStatuses))
      .groupBy(orderItems.category)
      .orderBy(desc(sql`sum(${orderItems.quantity})`)),
  ]);
  return { orders: recentOrders, ranking };
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

/** One order, only if it belongs to this account. */
export async function orderForUser(userId: string, orderId: string) {
  const db = getDb();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .limit(1);
  if (!order || order.status === "pending_payment") return null;
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

/** Fulfilment steps the admin can move a paid order through. */
const fulfilmentFlow: Partial<Record<OrderStatus, OrderStatus[]>> = {
  paid: ["packed", "shipped", "delivered"],
  packed: ["shipped", "delivered"],
  shipped: ["delivered"],
  needs_refund: ["cancelled"],
};

export async function updateOrderStatus(id: string, next: OrderStatus) {
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) throw new HttpError(404, "Order not found.");
  if (!fulfilmentFlow[order.status]?.includes(next)) {
    throw new HttpError(400, `An order that is ${order.status.replace("_", " ")} cannot move to ${next}.`);
  }
  const now = new Date();
  await db
    .update(orders)
    .set({
      status: next,
      ...(next === "packed" && { packedAt: now }),
      ...(next === "shipped" && { shippedAt: now, packedAt: order.packedAt ?? now }),
      ...(next === "delivered" && {
        deliveredAt: now,
        shippedAt: order.shippedAt ?? now,
        packedAt: order.packedAt ?? now,
      }),
    })
    .where(and(eq(orders.id, id), eq(orders.status, order.status)));
}
