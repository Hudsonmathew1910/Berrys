import "server-only";
import { money } from "@/lib/catalog";
import { serverEnv } from "@/lib/env";
import type { schema } from "@/db";

type Order = typeof schema.orders.$inferSelect;
type Item = typeof schema.orderItems.$inferSelect;

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Sends an order confirmation through Resend (https://resend.com).
 * Returns false without sending when RESEND_API_KEY is not configured.
 */
export async function sendOrderConfirmation(order: Order, items: Item[]): Promise<boolean> {
  const apiKey = serverEnv.resendApiKey();
  if (!apiKey) return false;

  const rows = items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0">${escape(i.name)} · Size ${escape(i.size)} × ${i.quantity}</td><td style="padding:6px 0;text-align:right">${money(i.price * i.quantity)}</td></tr>`,
    )
    .join("");
  const html = `
    <div style="font-family:Arial,sans-serif;color:#253b45;max-width:560px">
      <h2 style="color:#193547">Thank you, ${escape(order.customer)}!</h2>
      <p>Your Berry’s order <b>${order.id}</b> is confirmed and we are getting it ready.</p>
      <table style="width:100%;border-collapse:collapse">${rows}
        ${order.shipping ? `<tr><td>Shipping</td><td style="text-align:right">${money(order.shipping)}</td></tr>` : ""}
        <tr><td style="padding-top:10px;border-top:1px solid #e5e4dd"><b>Total paid</b></td>
            <td style="padding-top:10px;border-top:1px solid #e5e4dd;text-align:right"><b>${money(order.total)}</b></td></tr>
      </table>
      <p style="margin-top:18px"><b>Delivering to</b><br>${escape(order.address)}<br>PIN ${escape(order.pincode)}</p>
      <p style="color:#7d827e;font-size:13px">Questions? Just reply to this email.</p>
    </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: serverEnv.orderEmailFrom(),
      to: [order.email],
      subject: `Your Berry’s order ${order.id} is confirmed`,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
  return true;
}
