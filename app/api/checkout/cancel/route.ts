import { assertSameOrigin, handleError, json } from "@/lib/http";
import { releaseOrder } from "@/lib/orders";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { cancelPaymentSchema } from "@/lib/validation";

/** Customer closed the Razorpay window without paying: put the stock back. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit("cancel", clientIp(request), 30, 10 * 60);
    const body = cancelPaymentSchema.parse(await request.json());
    await releaseOrder(body.orderId, "cancelled", body.razorpayOrderId);
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
