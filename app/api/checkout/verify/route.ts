import { logError } from "@/lib/error-log";
import { assertSameOrigin, handleError, json } from "@/lib/http";
import { markOrderPaid } from "@/lib/orders";
import { verifyPaymentSignature } from "@/lib/razorpay";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { verifyPaymentSchema } from "@/lib/validation";

/**
 * Step 2: the browser hands back Razorpay's success payload. The signature
 * proves the payment really happened for our Razorpay order.
 * The webhook does the same job server-to-server in case the browser closes.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit("verify", clientIp(request), 30, 10 * 60);
    const body = verifyPaymentSchema.parse(await request.json());
    if (!verifyPaymentSignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature)) {
      await logError("payment", "Payment signature did not match", {
        path: "/api/checkout/verify",
        ref: body.orderId,
      });
      return json({ error: "We could not verify this payment. If money was deducted, contact us." }, 400);
    }
    const result = await markOrderPaid(body.razorpay_order_id, body.razorpay_payment_id);
    if (!result || result.orderId !== body.orderId) return json({ error: "Order not found." }, 404);
    return json({ orderId: result.orderId, status: result.status });
  } catch (e) {
    return handleError(e, "We could not confirm your payment yet. Please check back shortly.", {
      source: "payment",
      path: "/api/checkout/verify",
    });
  }
}
