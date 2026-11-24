import { after } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getViewer } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { assertSameOrigin, handleError, json } from "@/lib/http";
import {
  DEMO_ORDER_SECONDS,
  DEMO_PAYMENT_PREFIX,
  markOrderPaid,
  paymentState,
  purgeDemoOrders,
} from "@/lib/orders";
import { cancelPaymentSchema } from "@/lib/validation";

/** Keeps the function alive long enough for the one-minute demo-order timer. */
export const maxDuration = 120;

/**
 * Demo payments (Razorpay turned off in Settings, or PAYMENT_MODE=mock
 * locally): marks a demo order paid without taking money. One minute later
 * the order is deleted and its stock put back. 404 when Razorpay is on.
 */
export async function POST(request: Request) {
  const payment = await paymentState();
  if (payment.mode !== "demo" || !payment.ready) return json({ error: "Not found" }, 404);
  try {
    assertSameOrigin(request);
    const viewer = await getViewer();
    if (!viewer) return json({ error: "Please log in." }, 401);
    await rateLimit("mock-pay", viewer.userId, 20, 10 * 60);
    const body = cancelPaymentSchema.parse(await request.json());
    if (body.razorpayOrderId !== `mock_${body.orderId}`) return json({ error: "Not a demo order." }, 400);
    // Only the shopper's own pending demo order (checked before anything changes).
    const [own] = await getDb()
      .select({ userId: schema.orders.userId, isDemo: schema.orders.isDemo })
      .from(schema.orders)
      .where(eq(schema.orders.razorpayOrderId, body.razorpayOrderId));
    if (!own || !own.isDemo || (own.userId && own.userId !== viewer.userId))
      return json({ error: "Order not found." }, 404);
    const result = await markOrderPaid(
      body.razorpayOrderId,
      `${DEMO_PAYMENT_PREFIX}${crypto.randomUUID().slice(0, 8)}`,
    );
    if (!result || result.orderId !== body.orderId) return json({ error: "Order not found." }, 404);
    // The one-minute timer. Page loads and the dashboard also clean up any demo
    // order this misses (for example if the server restarts).
    after(async () => {
      await new Promise((r) => setTimeout(r, (DEMO_ORDER_SECONDS + 2) * 1000));
      await purgeDemoOrders();
    });
    return json({ orderId: result.orderId, status: result.status, demo: true });
  } catch (e) {
    return handleError(e, undefined, { source: "payment", path: "/api/checkout/mock-pay" });
  }
}
