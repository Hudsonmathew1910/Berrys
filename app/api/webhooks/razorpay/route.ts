import { after } from "next/server";
import { applyRefundEvent } from "@/lib/admin/orders";
import { sendRefundProgress } from "@/lib/email";
import { logError } from "@/lib/error-log";
import { json } from "@/lib/http";
import { markOrderPaid } from "@/lib/orders";
import { verifyWebhookSignature } from "@/lib/razorpay";

/**
 * Razorpay webhook (Dashboard → Settings → Webhooks).
 * Subscribe to: payment.captured, order.paid, refund.processed, refund.failed
 * URL: https://<your-domain>/api/webhooks/razorpay
 */
const MAX_BODY = 256 * 1024;

export async function POST(request: Request) {
  // Not set up yet (no Razorpay account): refuse cleanly.
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) return json({ error: "Webhook not configured" }, 503);
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY) return json({ error: "Too large" }, 413);
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: "Too large" }, 413);
  const signature = request.headers.get("x-razorpay-signature") || "";
  if (!/^[a-f0-9]{64}$/.test(signature) || !verifyWebhookSignature(raw, signature)) {
    await logError("payment", "Webhook with an invalid signature was rejected", {
      path: "/api/webhooks/razorpay",
    });
    return json({ error: "Invalid signature" }, 401);
  }

  try {
    const event = JSON.parse(raw);
    // Where a refund's money is: processed (reached the customer) or failed (bounced).
    if (event.event === "refund.processed" || event.event === "refund.failed") {
      const refund = event.payload?.refund?.entity;
      if (refund?.id) {
        const state = event.event === "refund.processed" ? "processed" : "failed";
        const why = String(refund.error_description ?? refund.notes?.failure_reason ?? "").slice(0, 300);
        const changed = await applyRefundEvent(String(refund.id), state, why);
        if (changed) {
          after(() => sendRefundProgress(String(refund.id)));
          if (state === "failed")
            await logError("payment", new Error(`Refund failed at Razorpay: ${refund.id}`), {
              path: "refund webhook",
              ref: changed.orderId,
            });
        }
      }
      return json({ ok: true });
    }
    if (event.event === "payment.captured" || event.event === "order.paid") {
      const payment = event.payload?.payment?.entity;
      if (payment?.order_id && payment?.id) await markOrderPaid(payment.order_id, payment.id);
    }
    return json({ ok: true });
  } catch (e) {
    await logError("payment", e, { path: "/api/webhooks/razorpay" });
    // Non-2xx makes Razorpay retry later.
    return json({ error: "Webhook processing failed" }, 500);
  }
}
