import { after } from "next/server";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { sendRefundRequested } from "@/lib/email";
import { HttpError } from "@/lib/http-error";
import { assertSameOrigin, handleError, json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { createRefundRequest, refundReasons } from "@/lib/refunds";
import { getSettings } from "@/lib/settings";

const bodySchema = z.object({
  orderId: z.string().trim().min(1).max(40),
  wholeOrder: z.boolean(),
  items: z
    .array(z.object({ orderItemId: z.string().uuid(), quantity: z.number().int().min(0).max(100) }))
    .max(50)
    .default([]),
  reason: z.enum(refundReasons, { message: "Please choose a reason." }),
  details: z.string().trim().max(1000).default(""),
});

/** Customer asks for a refund of a whole order or of some pieces. The team is emailed. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await getViewer();
    if (!viewer) throw new HttpError(401, "Please log in first.");
    await rateLimit("refund-request", viewer.userId, 5, 60 * 60);
    const body = bodySchema.parse(await request.json());
    if (body.reason === "Other" && body.details.length < 5)
      throw new HttpError(400, "Please tell us a little more about the problem.");
    const { order, request: req } = await createRefundRequest(
      viewer.userId,
      body.orderId,
      body,
      await getSettings(),
    );
    after(() => sendRefundRequested(order, req));
    return json({ ok: true, status: req.status });
  } catch (e) {
    return handleError(e, "We couldn’t send your refund request. Please try again.");
  }
}
