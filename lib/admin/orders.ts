import "server-only";
import { and, desc, eq, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { OrderStatus, RefundLine } from "@/db/schema";
import { HttpError } from "@/lib/http-error";
import { nextStatuses } from "@/lib/order-status";
import { addOrderEvent, DEMO_PAYMENT_PREFIX, eraseOrder, releaseExpiredOrders } from "@/lib/orders";
import { logError } from "@/lib/error-log";
import { refundPayment } from "@/lib/razorpay";

const { orders, orderItems, orderEvents, orderRefunds, inventory, stockMovements } = schema;

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

const refundable: OrderStatus[] = ["paid", "packed", "shipped", "delivered", "needs_refund"];

/**
 * Refund all or part of an order through Razorpay (simulated for demo payments).
 *
 * - `amount`: ₹ to send back — by default everything not refunded yet.
 * - `items`: the pieces this pays for. If the parcel hadn't left the shop, they go back into stock
 *   (a full refund puts back everything not already put back).
 * - The amount is reserved first (a "pending" row, with the order row locked), so two people
 *   refunding at once — or a refund racing an approval — can never send the same money twice.
 * - Once everything is refunded the order's status becomes "refunded".
 *
 * Returns the refund id.
 */
export async function refundAmount(
  orderId: string,
  actor: string,
  reason: string,
  opts: { amount?: number; items?: RefundLine[]; requestId?: string } = {},
) {
  const db = getDb();
  // 1) Check and reserve.
  const { order, claim } = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) throw new HttpError(404, "Order not found.");
    if (!refundable.includes(order.status)) throw new HttpError(400, "This order can’t be refunded.");
    if (!order.razorpayPaymentId) throw new HttpError(400, "This order has no payment to refund.");
    const [{ taken }] = await tx
      .select({ taken: sql<number>`coalesce(sum(${orderRefunds.amount}), 0)::int` })
      .from(orderRefunds)
      .where(and(eq(orderRefunds.orderId, orderId), ne(orderRefunds.status, "failed")));
    const left = order.total - taken;
    if (left <= 0) throw new HttpError(409, "This order is already being refunded or has been refunded.");
    const amount = opts.amount ?? left;
    if (!Number.isInteger(amount) || amount < 1) throw new HttpError(400, "Enter an amount of at least ₹1.");
    if (amount > left)
      throw new HttpError(400, `Only ₹${left.toLocaleString("en-IN")} is left to refund on this order.`);
    const [claim] = await tx
      .insert(orderRefunds)
      .values({ orderId, amount, items: opts.items ?? [], reason, actor, requestId: opts.requestId ?? null })
      .returning();
    return { order, claim };
  });

  // 2) Send the money (outside the transaction: never hold a lock while waiting on Razorpay).
  const isMock = order.razorpayPaymentId!.startsWith(DEMO_PAYMENT_PREFIX);
  let refund: { id: string; status?: string };
  try {
    refund = isMock
      ? { id: `rfnd_mock_${crypto.randomUUID().slice(0, 8)}` }
      : await refundPayment(order.razorpayPaymentId!, { order: orderId, refund: claim.id }, claim.amount);
  } catch (e) {
    await logError("payment", e, { path: "refund", ref: orderId });
    // Release the reservation so it can be tried again.
    await db
      .delete(orderRefunds)
      .where(and(eq(orderRefunds.id, claim.id), eq(orderRefunds.status, "pending")));
    throw e;
  }

  // 3) Record it.
  await db.transaction(async (tx) => {
    await tx
      .update(orderRefunds)
      .set({
        status: "done",
        razorpayRefundId: refund.id,
        // Demo payments, or Razorpay already done (instant refunds): processed now. Otherwise the
        // money is on its way and Razorpay's "refund.processed" webhook completes it.
        ...(isMock || refund.status === "processed"
          ? { gatewayStatus: "processed" as const, processedAt: new Date() }
          : { gatewayStatus: "initiated" as const }),
      })
      .where(eq(orderRefunds.id, claim.id));
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    const done = await tx
      .select()
      .from(orderRefunds)
      .where(and(eq(orderRefunds.orderId, orderId), eq(orderRefunds.status, "done")));
    const refundedAmount = done.reduce((a, r) => a + r.amount, 0);
    const full = refundedAmount >= o.total;
    await tx
      .update(orders)
      .set(
        full
          ? { refundedAmount, status: "refunded", refundId: refund.id, refundedAt: new Date() }
          : { refundedAmount },
      )
      .where(eq(orders.id, orderId));

    // Stock goes back only if the parcel hadn't left the shop.
    if (order.status === "paid" || order.status === "packed") {
      let lines: { productId: string; size: string; quantity: number }[] = claim.items;
      if (full && !claim.items.length) {
        // Everything not already put back by earlier part refunds.
        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
        const back = done.filter((r) => r.id !== claim.id).flatMap((r) => r.items);
        lines = items.map((i) => ({
          productId: i.productId,
          size: i.size,
          quantity:
            i.quantity - back.filter((b) => b.orderItemId === i.id).reduce((a, b) => a + b.quantity, 0),
        }));
      }
      for (const l of lines.filter((x) => x.quantity > 0)) {
        await tx
          .update(inventory)
          .set({ quantity: sql`${inventory.quantity} + ${l.quantity}` })
          .where(and(eq(inventory.productId, l.productId), eq(inventory.size, l.size)));
        await tx.insert(stockMovements).values({
          productId: l.productId,
          size: l.size,
          change: l.quantity,
          reason: "refund",
          orderId,
          actor,
        });
      }
    }
    await addOrderEvent(
      tx,
      orderId,
      full ? "refunded" : "part_refunded",
      actor,
      `₹${claim.amount.toLocaleString("en-IN")} · ${refund.id}${reason ? ` — ${reason}` : ""}`,
    );
  });
  return refund.id;
}

/** Full refund of whatever is left on the order. */
export function refundOrder(orderId: string, actor: string, reason: string) {
  return refundAmount(orderId, actor, reason);
}

/** Refunds sent on these orders, including any that failed (newest first). */
export async function refundsFor(orderIds: string[]) {
  if (!orderIds.length) return [];
  return getDb()
    .select()
    .from(orderRefunds)
    .where(and(inArray(orderRefunds.orderId, orderIds), inArray(orderRefunds.status, ["done", "failed"])))
    .orderBy(desc(orderRefunds.createdAt));
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
    const [busy] = await tx
      .select({ id: orderRefunds.id })
      .from(orderRefunds)
      .where(and(eq(orderRefunds.orderId, orderId), eq(orderRefunds.status, "pending")))
      .limit(1);
    if (busy) throw new HttpError(409, "This order is being refunded right now.");
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

/**
 * Razorpay's word on a refund (webhook): "processed" = the money reached the customer;
 * "failed" = it bounced, so it no longer counts as refunded — the order is flagged "Refund needed"
 * and a customer request it paid can be sent again. Safe to receive more than once.
 * Returns the refund row when something changed (to email the customer), else null.
 */
export async function applyRefundEvent(razorpayRefundId: string, event: "processed" | "failed", reason = "") {
  return getDb().transaction(async (tx) => {
    const [r] = await tx
      .select()
      .from(orderRefunds)
      .where(eq(orderRefunds.razorpayRefundId, razorpayRefundId))
      .for("update");
    if (!r || r.status !== "done") return null;
    if (event === "processed") {
      if (r.gatewayStatus === "processed") return null;
      const [row] = await tx
        .update(orderRefunds)
        .set({ gatewayStatus: "processed", processedAt: new Date() })
        .where(eq(orderRefunds.id, r.id))
        .returning();
      await addOrderEvent(
        tx,
        r.orderId,
        "refund_processed",
        "razorpay",
        `₹${r.amount.toLocaleString("en-IN")} · ${razorpayRefundId}`,
      );
      return row;
    }
    const why = reason || "Razorpay couldn’t complete the refund.";
    const [row] = await tx
      .update(orderRefunds)
      .set({ status: "failed", gatewayStatus: "failed", failureReason: why })
      .where(eq(orderRefunds.id, r.id))
      .returning();
    const [o] = await tx.select().from(orders).where(eq(orders.id, r.orderId)).for("update");
    const done = await tx
      .select({ amount: orderRefunds.amount })
      .from(orderRefunds)
      .where(and(eq(orderRefunds.orderId, r.orderId), eq(orderRefunds.status, "done")));
    const refundedAmount = done.reduce((a, x) => a + x.amount, 0);
    await tx
      .update(orders)
      .set(
        o.status === "refunded"
          ? { refundedAmount, status: "needs_refund", refundId: null, refundedAt: null }
          : { refundedAmount },
      )
      .where(eq(orders.id, r.orderId));
    if (r.requestId)
      await tx
        .update(schema.refundRequests)
        .set({ payoutError: `The refund failed at Razorpay (${why}). Send it again.` })
        .where(eq(schema.refundRequests.id, r.requestId));
    await addOrderEvent(
      tx,
      r.orderId,
      "refund_failed",
      "razorpay",
      `₹${r.amount.toLocaleString("en-IN")} · ${razorpayRefundId} — ${why}`,
    );
    return row;
  });
}
