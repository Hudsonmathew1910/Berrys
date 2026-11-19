import { getViewer } from "@/lib/auth";
import { HttpError } from "@/lib/http-error";
import { assertSameOrigin, handleError, json } from "@/lib/http";
import { createPendingOrder } from "@/lib/orders";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { checkoutSchema } from "@/lib/validation";

/**
 * Step 1: reserve stock and create the Razorpay order the browser will pay.
 * Buying needs a logged-in account with BOTH a Google email and a verified
 * mobile number; those verified values are used for the order, not whatever
 * the browser sends.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await getViewer();
    if (!viewer) throw new HttpError(401, "Please log in to place your order.");
    if (!viewer.email || !viewer.phone) {
      throw new HttpError(403, "Link your Google account and verify your mobile number to place an order.");
    }
    await rateLimit("checkout", clientIp(request), 10, 10 * 60);
    const body = (await request.json()) as Record<string, unknown>;
    const input = checkoutSchema.parse({ ...body, email: viewer.email, phone: viewer.phone });
    return json(await createPendingOrder(input, viewer));
  } catch (e) {
    return handleError(e, "We could not start checkout. Please try again.");
  }
}
