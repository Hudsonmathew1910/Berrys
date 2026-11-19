import "server-only";
import { and, desc, eq, gte, ilike, inArray, isNotNull, lt, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { isOwnerEmail } from "@/lib/auth";
import { HttpError } from "@/lib/http-error";
import { salesStatuses } from "@/lib/order-status";

const { orders, orderItems, users, addresses, products } = schema;
export const PAGE_SIZE = 20;
const likeTerm = (q: string) => `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const sold = inArray(orders.status, salesStatuses);

/** Headline numbers for a period, plus the previous period for comparison. */
export async function salesSummary(days: number) {
  const db = getDb();
  const period = (from: Date, to: Date) =>
    db
      .select({
        revenue: sql<number>`coalesce(sum(${orders.total}),0)::int`,
        orders: sql<number>`count(*)::int`,
        customers: sql<number>`count(distinct ${orders.email})::int`,
      })
      .from(orders)
      .where(and(sold, gte(orders.paidAt, from), lt(orders.paidAt, to)));
  const now = new Date();
  const [[cur], [prev], [units]] = await Promise.all([
    period(daysAgo(days), now),
    period(daysAgo(days * 2), daysAgo(days)),
    db
      .select({ units: sql<number>`coalesce(sum(${orderItems.quantity}),0)::int` })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(sold, gte(orders.paidAt, daysAgo(days)))),
  ]);
  return {
    ...cur,
    units: units.units,
    aov: cur.orders ? Math.round(cur.revenue / cur.orders) : 0,
    prev,
  };
}

/** Revenue and orders per day (India time) for the last N days, including empty days. */
export async function salesByDay(days: number) {
  const rows = await getDb()
    .select({
      day: sql<string>`to_char((${orders.paidAt} at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD')`,
      revenue: sql<number>`sum(${orders.total})::int`,
      orders: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(and(sold, gte(orders.paidAt, daysAgo(days))))
    .groupBy(sql`1`);
  const out: { day: string; revenue: number; orders: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const r = rows.find((x) => x.day === d);
    out.push({ day: d, revenue: r?.revenue ?? 0, orders: r?.orders ?? 0 });
  }
  return out;
}

export async function topProducts(days: number, limit = 10) {
  return getDb()
    .select({
      productId: orderItems.productId,
      name: orderItems.name,
      units: sql<number>`sum(${orderItems.quantity})::int`,
      revenue: sql<number>`sum(${orderItems.quantity} * ${orderItems.price})::int`,
      image: sql<string>`max(${products.image})`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .leftJoin(products, eq(products.id, orderItems.productId))
    .where(and(sold, gte(orders.paidAt, daysAgo(days))))
    .groupBy(orderItems.productId, orderItems.name)
    .orderBy(desc(sql`sum(${orderItems.quantity})`))
    .limit(limit);
}

/** Trending: biggest rise in units sold, last 7 days vs the 7 before. */
export async function trendingProducts(limit = 8) {
  const weekAgo = daysAgo(7).toISOString();
  const recent = sql`case when ${orders.paidAt} >= ${weekAgo}::timestamptz then ${orderItems.quantity} else 0 end`;
  const before = sql`case when ${orders.paidAt} < ${weekAgo}::timestamptz then ${orderItems.quantity} else 0 end`;
  return getDb()
    .select({
      productId: orderItems.productId,
      name: orderItems.name,
      recent: sql<number>`sum(${recent})::int`,
      before: sql<number>`sum(${before})::int`,
      image: sql<string>`max(${products.image})`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .leftJoin(products, eq(products.id, orderItems.productId))
    .where(and(sold, gte(orders.paidAt, daysAgo(14))))
    .groupBy(orderItems.productId, orderItems.name)
    .having(sql`sum(${recent}) > 0`)
    .orderBy(desc(sql`sum(${recent}) - sum(${before})`), desc(sql`sum(${recent})`))
    .limit(limit);
}

export async function salesByCategory(days: number) {
  return getDb()
    .select({
      category: orderItems.category,
      units: sql<number>`sum(${orderItems.quantity})::int`,
      revenue: sql<number>`sum(${orderItems.quantity} * ${orderItems.price})::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(sold, gte(orders.paidAt, daysAgo(days))))
    .groupBy(orderItems.category)
    .orderBy(desc(sql`sum(${orderItems.quantity} * ${orderItems.price})`));
}

/** Sizes that sell most (helps restocking). */
export async function salesBySize(days: number) {
  return getDb()
    .select({ size: orderItems.size, units: sql<number>`sum(${orderItems.quantity})::int` })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(sold, gte(orders.paidAt, daysAgo(days))))
    .groupBy(orderItems.size)
    .orderBy(desc(sql`sum(${orderItems.quantity})`));
}

export async function orderStatusCounts() {
  const rows = await getDb()
    .select({ status: orders.status, n: sql<number>`count(*)::int` })
    .from(orders)
    .groupBy(orders.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}

// ---------------------------------------------------------------- payments

export async function listPayments(f: { q?: string; page: number }) {
  const where: SQL[] = [isNotNull(orders.razorpayPaymentId)];
  if (f.q) {
    const t = likeTerm(f.q);
    where.push(or(ilike(orders.id, t), ilike(orders.razorpayPaymentId, t), ilike(orders.email, t))!);
  }
  const db = getDb();
  const [[agg], rows] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        collected: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} <> 'refunded'),0)::int`,
        refunded: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} = 'refunded'),0)::int`,
      })
      .from(orders)
      .where(and(...where)),
    db
      .select()
      .from(orders)
      .where(and(...where))
      .orderBy(desc(orders.paidAt))
      .limit(PAGE_SIZE)
      .offset((f.page - 1) * PAGE_SIZE),
  ]);
  return { rows, ...agg, pages: Math.max(1, Math.ceil(agg.total / PAGE_SIZE)) };
}

// ---------------------------------------------------------------- customers

export async function listCustomers(f: { q?: string; page: number }) {
  const where: SQL[] = [];
  if (f.q) {
    const t = likeTerm(f.q);
    where.push(or(ilike(users.name, t), ilike(users.email, t), ilike(users.phone, t))!);
  }
  const db = getDb();
  const spent = sql<number>`coalesce((select sum(o.total) from ${orders} o where o.user_id = "users"."id" and o.status in ('paid','packed','shipped','delivered')),0)::int`;
  const count = sql<number>`(select count(*) from ${orders} o where o.user_id = "users"."id" and o.status <> 'pending_payment')::int`;
  const [[{ total }], rows] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(users)
      .where(and(...where)),
    db
      .select({ user: users, spent, orders: count })
      .from(users)
      .where(and(...where))
      .orderBy(desc(users.createdAt))
      .limit(PAGE_SIZE)
      .offset((f.page - 1) * PAGE_SIZE),
  ]);
  return { rows, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function customerDetail(id: string) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) return null;
  const [list, addrs] = await Promise.all([
    db.select().from(orders).where(eq(orders.userId, id)).orderBy(desc(orders.createdAt)).limit(100),
    db.select().from(addresses).where(eq(addresses.userId, id)),
  ]);
  return { user, orders: list, addresses: addrs };
}

/**
 * Deletes a customer account: their logins, saved addresses and sessions go
 * with it. Their orders are kept (for sales records) without the account link.
 * Team members and the store owner must be removed from the team first.
 */
export async function deleteCustomer(userId: string) {
  const db = getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user) throw new HttpError(404, "Customer not found.");
  if (isOwnerEmail(user.email)) throw new HttpError(400, "The store owner’s account can’t be deleted.");
  if (user.email) {
    const [member] = await db
      .select({ id: schema.staffMembers.id })
      .from(schema.staffMembers)
      .where(eq(schema.staffMembers.email, user.email.toLowerCase()))
      .limit(1);
    if (member) throw new HttpError(400, "This person is on the team. Remove them on Team & access first.");
  }
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  return user;
}
