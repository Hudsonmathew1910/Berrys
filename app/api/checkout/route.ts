import { getViewer } from "@/lib/auth";
import { firebaseConfig } from "@/lib/firebase-verify";
import { HttpError } from "@/lib/http-error";
import { assertSameOrigin, handleError, json } from "@/lib/http";
import { createPendingOrder } from "@/lib/orders";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { checkoutSchema } from "@/lib/validation";

/**
 * Step 1: reserve stock and create the Razorpay order the browser will pay.
 * Buying needs a logged-in account with a Google email. When mobile OTP is
 * enabled (Firebase configured) a verified mobile is required too and used
 * for the order; otherwise the customer types their mobile number at checkout.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await getViewer();
    if (!viewer) throw new HttpError(401, "Please log in to place your order.");
    if (!viewer.email) throw new HttpError(403, "Link your Google account to place an order.");
    const phoneLogin = !!firebaseConfig();
    if (phoneLogin && !viewer.phone) {
      throw new HttpError(403, "Verify your mobile number to place an order.");
    }
    await rateLimit("checkout", clientIp(request), 10, 10 * 60);
    const body = (await request.json()) as Record<string, unknown>;
    const input = checkoutSchema.parse({
      ...body,
      email: viewer.email,
      phone: viewer.phone ?? body.phone,
    });
    return json(await createPendingOrder(input, viewer));
  } catch (e) {
    return handleError(e, "We could not start checkout. Please try again.");
  }
}
