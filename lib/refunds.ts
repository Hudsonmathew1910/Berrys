import "server-only";
import { and, count, desc, eq, inArray, ne, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { RefundLine, RefundRequestStatus } from "@/db/schema";
import { HttpError } from "@/lib/http-error";
import { addOrderEvent } from "@/lib/orders";
import { refundAmount } from "@/lib/admin/orders";
import type { Settings } from "@/lib/settings";

const { orders, orderItems, refundRequests } = schema;
type Order = typeof orders.$inferSelect;
export type RefundRequest = typeof refundRequests.$inferSelect;

export const refundReasons = [
  "Wrong size",
  "Damaged or defective",
  "Not as described",
  "Received the wrong item",
  "Arrived too late",
  "Changed my mind",
  "Other",
] as const;

export const refundStatusLabels: Record<RefundRequestStatus, string> = {
  requested: "Refund requested",
  verified: "Accepted by staff — waiting for admin",
  approved: "Refund approved",
  rejected: "Refund rejected",
};

/** Requests still waiting for someone in the team. */
export const OPEN_STATUSES: RefundRequestStatus[] = ["requested", "verified"];
const MAX_REQUESTS_PER_ORDER = 3;
const REFUNDABLE = ["paid", "packed", "delivered"];

/** Can the customer ask for a refund on this order right now? (null = yes, else the reason why not) */
export function refundBlocker(order: Order, settings: Settings, requests: RefundRequest[]): string | null {
  // On its way: the customer can't return it yet, and a refund now could pay out for a parcel that
  // still arrives. Staff can still refund from the dashboard (e.g. a lost parcel).
  if (order.status === "shipped")
    return "Your order is on its way. You can ask for a refund once it’s delivered.";
  if (order.isDemo) return null; // demo orders can try the rest of the flow
  if (!REFUNDABLE.includes(order.status) || order.refundId) return "This order can’t be refunded.";
  if (requests.some((r) => OPEN_STATUSES.includes(r.status))) return "Your refund request is being reviewed.";
  if (requests.some((r) => r.status === "approved")) return "A refund for this order was already approved.";
  if (requests.length >= MAX_REQUESTS_PER_ORDER) return "Please contact us about this order.";
  if (order.status === "delivered") {
    if (settings.returnDays <= 0) return "This shop doesn’t accept returns after delivery.";
    const until = (order.deliveredAt ?? order.createdAt).getTime() + settings.returnDays * 86_400_000;
    if (Date.now() > until) return `Refunds can be requested within ${settings.returnDays} days of delivery.`;
  }
  return null;
}

export async function requestsForOrder(orderId: string) {
  return getDb()
    .select()
    .from(refundRequests)
    .where(eq(refundRequests.orderId, orderId))
    .orderBy(desc(refundRequests.createdAt));
}

/** Customer: asks for a refund of the whole order or of chosen pieces. */
export async function createRefundRequest(
  userId: string,
  orderId: string,
  input: {
    wholeOrder: boolean;
    items: { orderItemId: string; quantity: number }[];
    reason: string;
    details: string;
  },
  settings: Settings,
) {
  return getDb().transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
      .for("update");
    if (!order) throw new HttpError(404, "Order not found.");
    const previous = await tx.select().from(refundRequests).where(eq(refundRequests.orderId, orderId));
    const blocker = refundBlocker(order, settings, previous);
    if (blocker) throw new HttpError(400, blocker);

    const all = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const lines: RefundLine[] = [];
    for (const item of all) {
      const quantity = input.wholeOrder
        ? item.quantity
        : (input.items.find((i) => i.orderItemId === item.id)?.quantity ?? 0);
      if (quantity < 0 || quantity > item.quantity) throw new HttpError(400, "Check the quantities.");
      if (quantity > 0)
        lines.push({
          orderItemId: item.id,
          productId: item.productId,
          name: item.name,
          size: item.size,
          quantity,
          price: item.price,
        });
    }
    if (!lines.length) throw new HttpError(400, "Choose at least one piece to refund.");
    const whole = all.every((i) => lines.find((l) => l.orderItemId === i.id)?.quantity === i.quantity);
    const amount = lines.reduce((a, l) => a + l.price * l.quantity, 0) + (whole ? order.shipping : 0);

    const [req] = await tx
      .insert(refundRequests)
      .values({
        orderId,
        userId,
        wholeOrder: whole,
        items: lines,
        amount,
        reason: input.reason,
        details: input.details,
      })
      .returning();
    await tx.update(orders).set({ refundRequest: "requested" }).where(eq(orders.id, orderId));
    await addOrderEvent(
      tx,
      orderId,
      "refund_requested",
      order.email,
      `${whole ? "Whole order" : lines.map((l) => `${l.name} (${l.size}) × ${l.quantity}`).join(", ")} — ${input.reason}`,
    );
    return { order, request: req };
  });
}

/** Staff checked the reason (and the parcel/photos) and passes it to an admin. */
export async function verifyRefundRequest(id: string, actor: string, note: string) {
  return getDb().transaction(async (tx) => {
    const [req] = await tx
      .update(refundRequests)
      .set({ status: "verified", verifiedBy: actor, verifiedAt: new Date(), staffNote: note })
      .where(and(eq(refundRequests.id, id), eq(refundRequests.status, "requested")))
      .returning();
    if (!req) throw new HttpError(409, "This request was already handled.");
    await tx.update(orders).set({ refundRequest: "verified" }).where(eq(orders.id, req.orderId));
    await addOrderEvent(tx, req.orderId, "refund_verified", actor, note);
    return req;
  });
}

/** Admin: accept or reject (works on requested or verified requests). */
export async function decideRefundRequest(
  id: string,
  decision: "approved" | "rejected",
  actor: string,
  note: string,
) {
  return getDb().transaction(async (tx) => {
    const [req] = await tx
      .update(refundRequests)
      .set({ status: decision, decidedBy: actor, decidedAt: new Date(), decisionNote: note })
      .where(and(eq(refundRequests.id, id), inArray(refundRequests.status, OPEN_STATUSES)))
      .returning();
    if (!req) throw new HttpError(409, "This request was already decided.");
    await tx.update(orders).set({ refundRequest: decision }).where(eq(orders.id, req.orderId));
    await addOrderEvent(tx, req.orderId, `refund_${decision}`, actor, note);
    return req;
  });
}

export async function getRefundRequest(id: string) {
  const [r] = await getDb().select().from(refundRequests).where(eq(refundRequests.id, id)).limit(1);
  return r ?? null;
}

export const REFUND_PAGE_SIZE = 20;

/** Dashboard list, newest first, with the order's customer details. */
export async function listRefundRequests(f: {
  status?: RefundRequestStatus | "open" | "decided";
  page: number;
}) {
  const where: SQL | undefined =
    f.status === "open"
      ? inArray(refundRequests.status, OPEN_STATUSES)
      : f.status === "decided"
        ? inArray(refundRequests.status, ["approved", "rejected"])
        : f.status
          ? eq(refundRequests.status, f.status)
          : undefined;
  const db = getDb();
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        request: refundRequests,
        customer: orders.customer,
        email: orders.email,
        orderStatus: orders.status,
        isDemo: orders.isDemo,
      })
      .from(refundRequests)
      .innerJoin(orders, eq(orders.id, refundRequests.orderId))
      .where(where)
      .orderBy(desc(refundRequests.createdAt))
      .limit(REFUND_PAGE_SIZE)
      .offset((f.page - 1) * REFUND_PAGE_SIZE),
    db.select({ n: count() }).from(refundRequests).where(where),
  ]);
  return { rows, total: n, pages: Math.max(1, Math.ceil(n / REFUND_PAGE_SIZE)) };
}

/** Counts for the dashboard badges: waiting for staff, waiting for an admin. */
export async function refundRequestCounts() {
  const rows = await getDb()
    .select({ status: refundRequests.status, n: count() })
    .from(refundRequests)
    .where(inArray(refundRequests.status, OPEN_STATUSES))
    .groupBy(refundRequests.status);
  const get = (s: RefundRequestStatus) => rows.find((r) => r.status === s)?.n ?? 0;
  return { requested: get("requested"), verified: get("verified") };
}

/**
 * Sends the money for an approved customer request: the pieces they asked for (plus shipping when
 * it's the whole order), never more than what's left to refund on the order. If it can't be sent
 * (e.g. Razorpay isn't connected), the reason is kept on the request so the team can retry.
 */
export async function payRefundRequest(id: string, actor: string) {
  const db = getDb();
  const req = await getRefundRequest(id);
  if (!req) throw new HttpError(404, "Refund request not found.");
  if (req.status !== "approved") throw new HttpError(400, "Approve the request first.");
  const [paid] = await db
    .select({ id: schema.orderRefunds.id })
    .from(schema.orderRefunds)
    .where(and(eq(schema.orderRefunds.requestId, id), ne(schema.orderRefunds.status, "failed")))
    .limit(1);
  if (paid) throw new HttpError(409, "This refund has already been sent.");
  const [order] = await db.select().from(orders).where(eq(orders.id, req.orderId)).limit(1);
  if (!order) throw new HttpError(404, "Order not found.");
  const left = order.total - order.refundedAmount;
  try {
    if (left <= 0) throw new HttpError(409, "This order has already been refunded in full.");
    const amount = Math.min(req.amount, left);
    const refundId = await refundAmount(req.orderId, actor, `Refund request — ${req.reason}`, {
      amount,
      // Whole order: everything left (and all remaining stock goes back if it hadn't shipped).
      items: req.wholeOrder || amount === left ? [] : req.items,
      requestId: id,
    });
    await db.update(refundRequests).set({ payoutError: "" }).where(eq(refundRequests.id, id));
    return { refundId, amount };
  } catch (e) {
    const why =
      e instanceof HttpError
        ? e.message
        : "Razorpay couldn’t send the money. Try again, or refund it from the Razorpay dashboard (details in the Error log).";
    await db.update(refundRequests).set({ payoutError: why }).where(eq(refundRequests.id, id));
    throw e instanceof HttpError ? e : new HttpError(502, why);
  }
}

/** Refunds already sent for these requests (request id → refund). */
export async function payoutsFor(requestIds: string[]) {
  type Payout = {
    amount: number;
    refundId: string;
    at: Date;
    state: "initiated" | "processed" | "failed";
    processedAt: Date | null;
  };
  if (!requestIds.length) return new Map<string, Payout>();
  const rows = await getDb()
    .select()
    .from(schema.orderRefunds)
    .where(and(inArray(schema.orderRefunds.requestId, requestIds), eq(schema.orderRefunds.status, "done")));
  return new Map<string, Payout>(
    rows.map((r) => [
      r.requestId!,
      {
        amount: r.amount,
        refundId: r.razorpayRefundId ?? "",
        at: r.createdAt,
        state: r.gatewayStatus,
        processedAt: r.processedAt,
      },
    ]),
  );
}

/** A customer's refunds on one order, for the progress timeline on their order page. */
export async function refundProgress(orderId: string) {
  return getDb()
    .select()
    .from(schema.orderRefunds)
    .where(
      and(eq(schema.orderRefunds.orderId, orderId), inArray(schema.orderRefunds.status, ["done", "failed"])),
    )
    .orderBy(desc(schema.orderRefunds.createdAt));
}
