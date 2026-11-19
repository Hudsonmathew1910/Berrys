import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Viewer } from "@/lib/auth";
import { HttpError } from "@/lib/http-error";
import { seedProducts, sizes, type Product } from "@/lib/catalog";
import type { OrderStatus } from "@/db/schema";
import type { ProductInput } from "@/lib/validation";

const { products, inventory, orders, orderItems, admins } = schema;

/** Statuses that count as real sales in analytics. */
export const soldStatuses: OrderStatus[] = ["paid", "packed", "shipped", "delivered"];

export async function listProducts(): Promise<Product[]> {
  const db = getDb();
  const [rows, stock] = await Promise.all([
    db.select().from(products).where(eq(products.active, true)).orderBy(products.createdAt, products.id),
    db.select().from(inventory),
  ]);
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
  await db
    .update(orders)
    .set({ status: next })
    .where(and(eq(orders.id, id), eq(orders.status, order.status)));
}
