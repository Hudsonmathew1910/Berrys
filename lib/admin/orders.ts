import "server-only";
import { and, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { OrderStatus } from "@/db/schema";
import { HttpError } from "@/lib/http-error";
import { nextStatuses } from "@/lib/order-status";
import {
  addOrderEvent,
  DEMO_PAYMENT_PREFIX,
  eraseOrder,
  releaseExpiredOrders,
  restoreStock,
} from "@/lib/orders";
import { logError } from "@/lib/error-log";
import { refundPayment } from "@/lib/razorpay";

const { orders, orderItems, orderEvents } = schema;

export const PAGE_SIZE = 20;

const likeTerm = (q: string) => `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;

export async function listOrders(f: { status?: string; q?: string; page: number }) {
  await releaseExpiredOrders();
  const where: SQL[] = [];
  if (f.status === "open") where.push(inArray(orders.status, ["paid", "packed", "shipped"]));
  else if (f.status === "refunds") where.push(inArray(orders.refundRequest, ["requested", "verified"]));
  else if (f.status) where.push(eq(orders.status, f.status as OrderStatus));
  else where.push(sql`${orders.status} <> 'pending_payment'`);
  if (f.q) {
    const t = likeTerm(f.q);
    where.push(
      or(ilike(orders.id, t), ilike(orders.customer, t), ilike(orders.email, t), ilike(orders.phone, t))!,
    );
  }
  const db = getDb();
  const [[{ total }], rows] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(...where)),
    db
      .select()
      .from(orders)
      .where(and(...where))
      .orderBy(desc(orders.createdAt))
      .limit(PAGE_SIZE)
      .offset((f.page - 1) * PAGE_SIZE),
  ]);
  return { rows, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function orderHistory(orderId: string) {
  return getDb()
    .select()
    .from(orderEvents)
    .where(eq(orderEvents.orderId, orderId))
    .orderBy(desc(orderEvents.createdAt));
}

/** Moves a paid order along: packed → shipped → delivered (timestamps fill in). */
export async function setOrderStatus(orderId: string, next: OrderStatus, actor: string, note = "") {
  await getDb().transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) throw new HttpError(404, "Order not found.");
    if (!nextStatuses[order.status]?.includes(next)) {
      throw new HttpError(400, `An order that is “${order.status}” can’t move to “${next}”.`);
    }
    const now = new Date();
    await tx
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
      .where(eq(orders.id, orderId));
    await addOrderEvent(tx, orderId, next, actor, note);
  });
}

export async function saveShipping(
  orderId: string,
  data: { courier: string; trackingNumber: string; trackingUrl: string; staffNote: string },
  actor: string,
) {
  await getDb().transaction(async (tx) => {
    const [o] = await tx.update(orders).set(data).where(eq(orders.id, orderId)).returning({ id: orders.id });
    if (!o) throw new HttpError(404, "Order not found.");
    const parts = [
      data.courier && `Courier: ${data.courier}`,
      data.trackingNumber && `Tracking: ${data.trackingNumber}`,
    ];
    await addOrderEvent(tx, orderId, "shipping_updated", actor, parts.filter(Boolean).join(" · "));
  });
}

const REFUND_PENDING = "pending";
const refundable: OrderStatus[] = ["paid", "packed", "shipped", "delivered", "needs_refund"];

/**
 * Full refund through Razorpay (simulated for mock payments). Stock goes back
 * on sale if the order hadn't left the store yet.
 */
export async function refundOrder(orderId: string, actor: string, reason: string) {
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new HttpError(404, "Order not found.");
  if (!refundable.includes(order.status)) throw new HttpError(400, "This order can’t be refunded.");
  if (!order.razorpayPaymentId) throw new HttpError(400, "This order has no payment to refund.");

  // Demo orders took no money, so their "refund" is simulated.
  const isMock = order.razorpayPaymentId.startsWith(DEMO_PAYMENT_PREFIX);
  // Claim the refund atomically: if two people click "Refund" at once, only
  // one gets past this line, so Razorpay is never asked to refund twice.
  const [claimed] = await db
    .update(orders)
    .set({ refundId: REFUND_PENDING })
    .where(and(eq(orders.id, orderId), isNull(orders.refundId), inArray(orders.status, refundable)))
    .returning({ status: orders.status });
  if (!claimed) throw new HttpError(409, "This order is already being refunded or has been refunded.");

  let refund: { id: string };
  try {
    refund = isMock
      ? { id: `rfnd_mock_${crypto.randomUUID().slice(0, 8)}` }
      : await refundPayment(order.razorpayPaymentId, { order: orderId });
  } catch (e) {
    await logError("payment", e, { path: "refund", ref: orderId });
    // Release the claim so it can be retried.
    await db
      .update(orders)
      .set({ refundId: null })
      .where(and(eq(orders.id, orderId), eq(orders.refundId, REFUND_PENDING)));
    throw e;
  }

  await db.transaction(async (tx) => {
    const [o] = await tx
      .update(orders)
      .set({ status: "refunded", refundId: refund.id, refundedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.refundId, REFUND_PENDING)))
      .returning({ id: orders.id });
    if (!o) throw new HttpError(409, "The order changed while refunding. Please check it.");
    // Stock goes back only if the parcel hadn’t left (status at the moment of claiming).
    if (claimed.status === "paid" || claimed.status === "packed")
      await restoreStock(tx, orderId, "refund", actor);
    await addOrderEvent(tx, orderId, "refunded", actor, `${refund.id}${reason ? ` — ${reason}` : ""}`);
  });
  return refund.id;
}

export async function orderItemsFor(orderIds: string[]) {
  if (!orderIds.length) return [];
  return getDb().select().from(orderItems).where(inArray(orderItems.orderId, orderIds));
}

/**
 * Deletes an order for good. Orders still waiting for a real payment can't be
 * deleted (Razorpay could still capture it); orders mid-refund neither.
 */
export async function deleteOrder(orderId: string, actor: string) {
  return getDb().transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) throw new HttpError(404, "Order not found.");
    if (order.status === "pending_payment" && !order.isDemo)
      throw new HttpError(
        400,
        "This order is still waiting for payment. You can delete it once it expires (30 minutes).",
      );
    if (order.refundId === REFUND_PENDING)
      throw new HttpError(409, "This order is being refunded right now.");
    await eraseOrder(tx, order, actor);
    return order;
  });
}

/** Removes every expired or cancelled (never paid) order. Returns how many. */
export async function deleteUnpaidOrders(actor: string) {
  const db = getDb();
  const ids = await db
    .select({ id: orders.id })
    .from(orders)
    .where(inArray(orders.status, ["expired", "cancelled"]))
    .limit(500);
  for (const { id } of ids) {
    await db.transaction(async (tx) => {
      const [o] = await tx.select().from(orders).where(eq(orders.id, id)).for("update", { skipLocked: true });
      if (o && (o.status === "expired" || o.status === "cancelled")) await eraseOrder(tx, o, actor);
    });
  }
  return ids.length;
}

/** New orders waiting to be packed (paid, not packed yet) — the badge on "Orders". */
export async function newOrderCount() {
  const [{ n }] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.orders)
    .where(eq(schema.orders.status, "paid"));
  return n;
}
