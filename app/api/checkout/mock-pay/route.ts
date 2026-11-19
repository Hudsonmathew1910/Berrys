import { assertSameOrigin, handleError, json } from "@/lib/http";
import { isMockPayments, markOrderPaid } from "@/lib/orders";
import { cancelPaymentSchema } from "@/lib/validation";

/**
 * DEVELOPMENT ONLY: simulates a successful payment when PAYMENT_MODE=mock.
 * Returns 404 in production builds regardless of configuration.
 */
export async function POST(request: Request) {
  if (!isMockPayments()) return json({ error: "Not found" }, 404);
  try {
    assertSameOrigin(request);
    const body = cancelPaymentSchema.parse(await request.json());
    if (!body.razorpayOrderId.startsWith("mock_")) return json({ error: "Not a test order." }, 400);
    const result = await markOrderPaid(body.razorpayOrderId, `pay_mock_${crypto.randomUUID().slice(0, 8)}`);
    if (!result || result.orderId !== body.orderId) return json({ error: "Order not found." }, 404);
    return json({ orderId: result.orderId, status: result.status });
  } catch (e) {
    return handleError(e);
  }
}
