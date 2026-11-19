import { getViewer } from "@/lib/auth";
import { assertSameOrigin, handleError, json } from "@/lib/http";
import { createPendingOrder } from "@/lib/orders";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { checkoutSchema } from "@/lib/validation";

/** Step 1: reserve stock and create the Razorpay order the browser will pay. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit("checkout", clientIp(request), 10, 10 * 60);
    const input = checkoutSchema.parse(await request.json());
    const result = await createPendingOrder(input, await getViewer());
    return json(result);
  } catch (e) {
    return handleError(e, "We could not start checkout. Please try again.");
  }
}
