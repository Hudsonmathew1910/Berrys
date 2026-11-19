import { json } from "@/lib/http";
import { markOrderPaid } from "@/lib/orders";
import { verifyWebhookSignature } from "@/lib/razorpay";

/**
 * Razorpay webhook (Dashboard → Settings → Webhooks).
 * Subscribe to: payment.captured, order.paid
 * URL: https://<your-domain>/api/webhooks/razorpay
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature") || "";
  if (!signature || !verifyWebhookSignature(raw, signature)) {
    return json({ error: "Invalid signature" }, 401);
  }

  try {
    const event = JSON.parse(raw);
    if (event.event === "payment.captured" || event.event === "order.paid") {
      const payment = event.payload?.payment?.entity;
      if (payment?.order_id && payment?.id) await markOrderPaid(payment.order_id, payment.id);
    }
    return json({ ok: true });
  } catch (e) {
    console.error("Razorpay webhook failed", e);
    // Non-2xx makes Razorpay retry later.
    return json({ error: "Webhook processing failed" }, 500);
  }
}
