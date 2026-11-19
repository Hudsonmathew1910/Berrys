import "server-only";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb, schema, type Tx } from "@/db";
import type { Viewer } from "@/lib/auth";
import { HttpError } from "@/lib/http-error";
import { shippingFor } from "@/lib/catalog";
import { sendOrderConfirmation, sendStatusUpdate, sendTeamNewOrder } from "@/lib/email";
import { serverEnv } from "@/lib/env";
import { logError } from "@/lib/error-log";
import { getSettings, shippingRule } from "@/lib/settings";
import { activeOffers, bestPrice } from "@/lib/offers";
import { createRazorpayOrder } from "@/lib/razorpay";
import type { CheckoutInput } from "@/lib/validation";

const {
  products,
  inventory,
  orders,
  orderItems,
  stockMovements,
  orderEvents,
  approvalRequests,
  activityLog,
  errorLogs,
} = schema;

/** Records an order history entry. */
export async function addOrderEvent(tx: Tx, orderId: string, status: string, actor = "system", note = "") {
  await tx.insert(orderEvents).values({ orderId, status, actor, note });
}

/** How long stock stays reserved while the customer completes payment. */
const PAYMENT_WINDOW_MINUTES = 30;
/** Unpaid checkouts one email address may have open at once. */
const MAX_PENDING_PER_EMAIL = 2;

/** Local development shortcut: PAYMENT_MODE=mock forces demo payments (never in production builds). */
function envMock() {
  return process.env.PAYMENT_MODE === "mock" && process.env.NODE_ENV !== "production";
}

export const razorpayConfigured = () => !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

export type PaymentState = { mode: "razorpay" | "demo"; ready: boolean };

/**
 * How checkout takes payment right now (Dashboard → Settings → Payments).
 * - razorpay: real payments (needs the Razorpay keys).
 * - demo: Razorpay is turned off, so anyone can check out without paying.
 *   Demo orders are flagged is_demo and deleted one minute later, with
 *   their stock put back (see purgeDemoOrders).
 */
export async function paymentState(): Promise<PaymentState> {
  if (envMock()) return { mode: "demo", ready: true };
  const { paymentMode } = await getSettings();
  if (paymentMode === "razorpay") return { mode: "razorpay", ready: razorpayConfigured() };
  return { mode: "demo", ready: true };
}

/** Demo orders' payment ids start with this. */
export const DEMO_PAYMENT_PREFIX = "pay_mock_";
/** How long a demo order exists before it is deleted. */
export const DEMO_ORDER_SECONDS = 60;

/**
 * Deletes demo orders older than one minute: puts back any stock they still
 * hold, removes their stock movements, then the order (items and history
 * are deleted with it). Safe to run often and in parallel.
 */
export async function purgeDemoOrders() {
  const db = getDb();
  const old = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(eq(orders.isDemo, true), lt(orders.createdAt, new Date(Date.now() - DEMO_ORDER_SECONDS * 1000))),
    )
    .limit(50);
  for (const { id } of old) {
    await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, id), eq(orders.isDemo, true)))
        .for("update", { skipLocked: true });
      if (locked) await eraseOrder(tx, locked, "system");
    });
  }
  return old.length;
}

/**
 * Removes an order from the database (inside the caller's transaction, with
 * the order row locked).
 * - Demo orders: everything they changed is undone — stock put back, their
 *   stock movements, history, staff requests, activity and error-log lines
 *   removed — as if the order never happened.
 * - Real orders: stock still held for an order that hasn't left the shop
 *   (awaiting payment / paid / packed) is put back with a "deleted" stock
 *   movement; the stock history is kept for the records.
 */
export async function eraseOrder(tx: Tx, order: typeof orders.$inferSelect, actor: string) {
  const held = await tx
    .select({
      productId: stockMovements.productId,
      size: stockMovements.size,
      net: sql<number>`sum(${stockMovements.change})::int`,
    })
    .from(stockMovements)
    .where(eq(stockMovements.orderId, order.id))
    .groupBy(stockMovements.productId, stockMovements.size);
  const stillInShop = order.isDemo || ["pending_payment", "paid", "packed"].includes(order.status);
  for (const h of held) {
    if (h.net >= 0 || !stillInShop) continue;
    await tx
      .update(inventory)
      .set({ quantity: sql`${inventory.quantity} + ${-h.net}` })
      .where(and(eq(inventory.productId, h.productId), eq(inventory.size, h.size)));
    if (!order.isDemo)
      await tx.insert(stockMovements).values({
        productId: h.productId,
        size: h.size,
        change: -h.net,
        reason: "deleted",
        orderId: order.id,
        actor,
        note: "Order deleted",
      });
  }
  await tx.delete(approvalRequests).where(eq(approvalRequests.targetId, order.id));
  if (order.isDemo) {
    await tx.delete(stockMovements).where(eq(stockMovements.orderId, order.id));
    await tx.delete(activityLog).where(eq(activityLog.target, order.id));
    await tx.delete(errorLogs).where(eq(errorLogs.ref, order.id));
  }
  // Items and order history are deleted with the order (ON DELETE CASCADE).
  await tx.delete(orders).where(eq(orders.id, order.id));
}

let lastPurge = 0;
/** purgeDemoOrders at most every 15 seconds per server instance (called on page loads). */
export async function maybePurgeDemoOrders() {
  if (Date.now() - lastPurge < 15_000) return;
  lastPurge = Date.now();
  try {
    await purgeDemoOrders();
  } catch (e) {
    await logError("payment", e, { path: "purge demo orders" });
  }
}

class OutOfStock extends Error {}

function newOrderId() {
  return "BRY-" + crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
}

/** Decrements stock only if enough is left. Throws OutOfStock otherwise (rolling back the tx). */
async function reserveLine(tx: Tx, productId: string, size: string, quantity: number, orderId: string) {
  const updated = await tx
    .update(inventory)
    .set({ quantity: sql`${inventory.quantity} - ${quantity}` })
    .where(
      and(
        eq(inventory.productId, productId),
        eq(inventory.size, size),
        sql`${inventory.quantity} >= ${quantity}`,
      ),
    )
    .returning({ quantity: inventory.quantity });
  if (!updated.length) throw new OutOfStock(`${productId}:${size}`);
  await tx.insert(stockMovements).values({ productId, size, change: -quantity, reason: "order", orderId });
}

export async function restoreStock(tx: Tx, orderId: string, reason = "released", actor = "system") {
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  for (const item of items) {
    await tx
      .update(inventory)
      .set({ quantity: sql`${inventory.quantity} + ${item.quantity}` })
      .where(and(eq(inventory.productId, item.productId), eq(inventory.size, item.size)));
    await tx.insert(stockMovements).values({
      productId: item.productId,
      size: item.size,
      change: item.quantity,
      reason,
      orderId,
      actor,
    });
  }
}

/**
 * Step 1 of checkout: validates the bag against live prices and stock,
 * reserves the stock and records a pending order, then creates the matching
 * Razorpay order. Prices always come from the database, never the browser.
 */
export async function createPendingOrder(input: CheckoutInput, viewer: Viewer, payment: PaymentState) {
  if (!payment.ready) throw new HttpError(503, "Online payment isn’t available yet. Please check back soon.");
  await releaseExpiredOrders();

  // Merge duplicate product/size lines.
  const lines = new Map<string, { productId: string; size: string; quantity: number }>();
  for (const item of input.items) {
    const key = `${item.productId}:${item.size}`;
    const prev = lines.get(key);
    lines.set(key, { ...item, quantity: (prev?.quantity ?? 0) + item.quantity });
  }

  const orderId = newOrderId();
  const db = getDb();

  // Stop one shopper (or a bot) from holding lots of stock in unpaid checkouts.
  const [{ pending }] = await db
    .select({ pending: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(eq(orders.email, input.email), eq(orders.status, "pending_payment")));
  if (pending >= MAX_PENDING_PER_EMAIL) {
    throw new HttpError(
      429,
      "You already have a checkout waiting for payment. Complete or close it, or try again in 30 minutes.",
    );
  }

  const [offers, settings] = await Promise.all([activeOffers(), getSettings()]);
  const rule = shippingRule(settings);
  const { total } = await db.transaction(async (tx) => {
    const ids = [...new Set([...lines.values()].map((l) => l.productId))];
    const found = await tx
      .select()
      .from(products)
      .where(and(inArray(products.id, ids), eq(products.active, true)));

    let subtotal = 0;
    const priced = [...lines.values()].map((line) => {
      const p = found.find((x) => x.id === line.productId);
      if (!p) throw new HttpError(409, "An item in your bag is no longer available. Please update your bag.");
      // Same offer rules as the storefront, applied on the server.
      const unitPrice = bestPrice(p, offers).price;
      subtotal += unitPrice * line.quantity;
      return { ...line, product: p, unitPrice };
    });

    for (const line of priced) {
      try {
        await reserveLine(tx, line.productId, line.size, line.quantity, orderId);
      } catch (e) {
        if (e instanceof OutOfStock) {
          throw new HttpError(
            409,
            `${line.product.name} in ${line.size} no longer has enough stock. Please update your bag.`,
          );
        }
        throw e;
      }
    }

    const shipping = shippingFor(subtotal, rule);
    const total = subtotal + shipping;
    await tx.insert(orders).values({
      id: orderId,
      userId: viewer?.userId ?? null,
      customer: input.customer,
      email: input.email,
      phone: input.phone,
      address: input.address,
      pincode: input.pincode,
      subtotal,
      shipping,
      total,
      status: "pending_payment",
      isDemo: payment.mode === "demo",
      expiresAt: new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60_000),
    });
    await tx.insert(orderItems).values(
      priced.map((l) => ({
        orderId,
        productId: l.productId,
        name: l.product.name,
        category: l.product.category,
        size: l.size,
        quantity: l.quantity,
        price: l.unitPrice,
      })),
    );
    await addOrderEvent(tx, orderId, "pending_payment", input.email, "Checkout started");
    return { total };
  });

  const mock = payment.mode === "demo";
  let razorpayOrder;
  try {
    razorpayOrder = mock
      ? { id: `mock_${orderId}`, amount: total * 100, currency: "INR" }
      : await createRazorpayOrder({
          amountInRupees: total,
          receipt: orderId,
          notes: { berrys_order_id: orderId },
        });
  } catch (e) {
    await releaseOrder(orderId, "cancelled");
    throw e;
  }
  await db.update(orders).set({ razorpayOrderId: razorpayOrder.id }).where(eq(orders.id, orderId));

  return {
    orderId,
    total,
    mock,
    razorpay: {
      keyId: mock ? "mock" : serverEnv.razorpayKeyId(),
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
    },
    prefill: { name: input.customer, email: input.email, contact: input.phone },
  };
}

/**
 * Returns a pending order's stock. Only acts while the order is still
 * pending_payment, so it is safe to call more than once or concurrently.
 */
export async function releaseOrder(
  orderId: string,
  status: "cancelled" | "expired",
  razorpayOrderId?: string,
) {
  return getDb().transaction(async (tx) => {
    const released = await tx
      .update(orders)
      .set({ status })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.status, "pending_payment"),
          razorpayOrderId ? eq(orders.razorpayOrderId, razorpayOrderId) : undefined,
        ),
      )
      .returning({ id: orders.id });
    if (released.length) {
      await restoreStock(tx, orderId);
      await addOrderEvent(
        tx,
        orderId,
        status,
        "system",
        status === "expired" ? "Payment window expired" : "Customer closed the payment window",
      );
    }
    return released.length > 0;
  });
}

/** Lazily expires abandoned checkouts so their stock goes back on sale. */
export async function releaseExpiredOrders() {
  await maybePurgeDemoOrders();
  const stale = await getDb()
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.status, "pending_payment"), lt(orders.expiresAt, new Date())))
    .limit(50);
  for (const { id } of stale) await releaseOrder(id, "expired");
}

/**
 * Marks an order paid after a verified Razorpay payment. Called from both the
 * browser verify step and the webhook, so it is idempotent. If the order had
 * already expired, it tries to reserve the stock again; when that is no longer
 * possible the order is flagged needs_refund for the owner to refund.
 */
export async function markOrderPaid(razorpayOrderId: string, razorpayPaymentId: string) {
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.razorpayOrderId, razorpayOrderId))
      .for("update");
    if (!order) return null;

    if (order.status === "pending_payment") {
      await tx
        .update(orders)
        .set({ status: "paid", paidAt: new Date(), razorpayPaymentId })
        .where(eq(orders.id, order.id));
      await addOrderEvent(tx, order.id, "paid", "razorpay", razorpayPaymentId);
      return { orderId: order.id, status: "paid" as const };
    }

    if (order.status === "cancelled" || order.status === "expired") {
      // Late payment: the stock was returned, so try to take it again.
      let status: "paid" | "needs_refund" = "paid";
      try {
        await tx.transaction(async (sp) => {
          const items = await sp.select().from(orderItems).where(eq(orderItems.orderId, order.id));
          for (const i of items) await reserveLine(sp, i.productId, i.size, i.quantity, order.id);
        });
      } catch (e) {
        if (!(e instanceof OutOfStock)) throw e;
        status = "needs_refund";
      }
      await tx
        .update(orders)
        .set({ status, paidAt: new Date(), razorpayPaymentId })
        .where(eq(orders.id, order.id));
      await addOrderEvent(tx, order.id, status, "razorpay", "Late payment " + razorpayPaymentId);
      return { orderId: order.id, status };
    }

    return { orderId: order.id, status: order.status }; // already handled
  });

  if (result?.status === "paid") await sendConfirmationOnce(result.orderId);
  if (result?.status === "needs_refund") {
    await logError("payment", "Payment arrived after the stock ran out — this order needs a refund", {
      ref: result.orderId,
    });
    await sendStatusUpdate(result.orderId, "needs_refund");
  }
  return result;
}

/** Sends the confirmation email at most once, even if verify and webhook race. */
async function sendConfirmationOnce(orderId: string) {
  const db = getDb();
  const [claimed] = await db
    .update(orders)
    .set({ confirmationSentAt: new Date() })
    .where(and(eq(orders.id, orderId), sql`${orders.confirmationSentAt} is null`))
    .returning();
  if (!claimed) return;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  // Team members who chose "Email me new orders" (independent of the customer email).
  await sendTeamNewOrder(claimed, items);
  try {
    const sent = await sendOrderConfirmation(claimed, items);
    if (!sent) {
      await db.update(orders).set({ confirmationSentAt: null }).where(eq(orders.id, orderId));
    }
  } catch (e) {
    await logError("email", e, { path: "order-confirmation", ref: orderId });
    await db.update(orders).set({ confirmationSentAt: null }).where(eq(orders.id, orderId));
  }
}

export async function getOrderStatus(orderId: string) {
  const [order] = await getDb()
    .select({ id: orders.id, status: orders.status, total: orders.total })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  return order ?? null;
}
