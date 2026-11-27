import "server-only";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { Transporter } from "nodemailer";
import { getDb, schema } from "@/db";
import type { OrderStatus } from "@/db/schema";
import { isOwnerEmail } from "@/lib/auth";
import { money } from "@/lib/catalog";
import { serverEnv } from "@/lib/env";
import { logError } from "@/lib/error-log";
import { statusLabels } from "@/lib/order-status";
import { getSettings, type Settings } from "@/lib/settings";
import { adminHref, can } from "@/lib/staff-core";

type Order = typeof schema.orders.$inferSelect;
type Item = typeof schema.orderItems.$inferSelect;

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// ---------------------------------------------------------------- sending

/** Is any email provider set up (Gmail SMTP or Resend)? */
export const emailConfigured = () => !!(serverEnv.smtp() || serverEnv.resendApiKey());

type Provider = "smtp" | "resend";
const providerNames: Record<Provider, string> = { smtp: "Gmail SMTP", resend: "Resend" };

/** Which providers have their keys in the environment. */
export const emailProvidersReady = (): Record<Provider, boolean> => ({
  smtp: !!serverEnv.smtp(),
  resend: !!serverEnv.resendApiKey(),
});

/** Providers that are set up, the chosen one (Settings → Emails) first and the other as backup. */
function providerOrder(primary: Provider): Provider[] {
  const ready = emailProvidersReady();
  return ([primary, primary === "smtp" ? "resend" : "smtp"] as const).filter((p) => ready[p]);
}

/** e.g. "Resend, backup: Gmail SMTP". */
export const emailProvider = (primary: Provider = "resend") =>
  providerOrder(primary)
    .map((p) => providerNames[p])
    .join(", backup: ");

let transport: Transporter | null = null;

/**
 * Sends one email with the provider chosen in Settings → Emails (Resend by
 * default); if it isn't set up or fails, the other one sends it instead.
 * Note: Gmail files mail an account sends to itself under Sent, not the Inbox.
 * Returns false when no provider is configured; throws when every provider fails.
 */
export async function sendMail(mail: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  /** What kind of email, for the counter in Settings → Emails. */
  kind?: string;
}) {
  const smtp = serverEnv.smtp();
  const apiKey = serverEnv.resendApiKey();
  if (!smtp && !apiKey) return false;
  const providers = providerOrder((await getSettings()).emailPrimary);
  const errors: unknown[] = [];
  for (const provider of providers) {
    try {
      await deliver(mail, provider, smtp, apiKey);
      await countSend(mail.kind ?? "", true, provider);
      // The backup saved this email, but the chosen provider is broken: keep its
      // reason in the error log (Dashboard → Errors) so it can be fixed.
      for (const e of errors)
        await logError("email", e, { path: `${mail.kind ?? "email"} (sent by backup ${providerNames[provider]})` });
      return true;
    } catch (e) {
      await countSend(mail.kind ?? "", false, provider);
      errors.push(e);
    }
  }
  throw errors.length === 1 ? errors[0] : new AggregateError(errors, errors.map(String).join(" | "));
}

/** Records one send for the counter (never throws), and now and then drops rows older than 60 days. */
async function countSend(kind: string, ok: boolean, provider: string) {
  try {
    const db = getDb();
    await db.insert(schema.emailSends).values({ kind, ok, provider });
    if (Math.random() < 0.02)
      await db
        .delete(schema.emailSends)
        .where(lt(schema.emailSends.sentAt, new Date(Date.now() - 60 * 864e5)));
  } catch {
    // The counter must never stop an email.
  }
}

/** Emails sent in the last 24 hours / 7 days / 30 days, failures, and the last 24 hours by kind. */
export async function emailStats(provider?: Provider) {
  const t = schema.emailSends;
  const since = (days: number) => new Date(Date.now() - days * 864e5);
  const db = getDb();
  const only = (p?: Provider) => (p ? eq(t.provider, p) : undefined);
  const count = (days: number, ok: boolean, p = provider) =>
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(t)
      .where(and(gt(t.sentAt, since(days)), eq(t.ok, ok), only(p)))
      .then((rows) => rows[0].n);
  const other = provider && (provider === "smtp" ? "resend" : "smtp");
  const [day, week, month, failedDay, byKind, otherDay] = await Promise.all([
    count(1, true),
    count(7, true),
    count(30, true),
    count(1, false),
    db
      .select({ kind: t.kind, n: sql<number>`count(*)::int` })
      .from(t)
      .where(and(gt(t.sentAt, since(1)), eq(t.ok, true), only(provider)))
      .groupBy(t.kind)
      .orderBy(sql`count(*) desc`),
    other ? count(1, true, other) : Promise.resolve(0),
  ]);
  return { day, week, month, failedDay, byKind, otherDay };
}

/** Daily sending limit for a provider (Settings → Emails sent). */
export const providerDailyLimit = (s: Settings, p: Provider) =>
  p === "resend" ? s.resendDailyLimit : s.emailDailyLimit;

export { providerNames as emailProviderNames };

/**
 * Plain-text copy of an email's HTML. Spam filters distrust HTML-only mail, and
 * text-only mail apps show this instead. Links become "label: url".
 */
export function htmlToText(html: string) {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, "").trim();
      const url = href.replace(/&amp;/g, "&");
      return !text || text === url || url.startsWith("mailto:") ? text || url : `${text}: ${url}`;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr|table|li)>/gi, "\n")
    .replace(/<\/td>\s*<td[^>]*>/gi, " — ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => entities[e])
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function deliver(
  mail: { to: string; subject: string; html: string; replyTo?: string },
  provider: Provider,
  smtp: ReturnType<typeof serverEnv.smtp>,
  apiKey: string,
) {
  const { siteName, supportEmail } = await getSettings();
  const replyTo = mail.replyTo ?? (supportEmail || undefined);
  const text = htmlToText(mail.html);

  if (provider === "smtp" && smtp) {
    if (!transport) {
      const nodemailer = await import("nodemailer");
      transport = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        requireTLS: true,
        auth: { user: smtp.user, pass: smtp.pass },
        connectionTimeout: 10_000,
        socketTimeout: 15_000,
      });
    }
    // Gmail only sends "from" the signed-in account, so keep that address and just set the name.
    await transport.sendMail({
      from: { name: siteName, address: smtp.user },
      to: mail.to,
      replyTo,
      subject: mail.subject,
      html: mail.html,
      text,
    });
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: serverEnv.orderEmailFrom(),
      to: [mail.to],
      reply_to: replyTo,
      subject: mail.subject,
      html: mail.html,
      text,
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

/** Like sendMail, but a failure is written to the error log instead of thrown. */
async function trySend(kind: string, ref: string, mail: Parameters<typeof sendMail>[0]) {
  try {
    return await sendMail({ kind, ...mail });
  } catch (e) {
    await logError("email", e, { path: kind, ref });
    return false;
  }
}

// ---------------------------------------------------------------- layout

function layout(s: Settings, body: string) {
  const site = serverEnv.emailSiteUrl();
  const contact = [
    s.supportEmail &&
      `<a href="mailto:${escape(s.supportEmail)}" style="color:#7d827e">${escape(s.supportEmail)}</a>`,
    s.supportPhone && escape(s.supportPhone),
  ]
    .filter(Boolean)
    .join(" · ");
  return `
  <div style="background:#f6f4ef;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e4dd">
      <div style="background:#183147;padding:18px 24px">
        <a href="${site}" style="color:#ffffff;text-decoration:none;font-size:20px;font-weight:bold;letter-spacing:2px">${escape(s.siteName.toUpperCase())}</a>
      </div>
      <div style="padding:24px;color:#253b45;font-size:15px;line-height:1.55">${body}</div>
      <div style="padding:16px 24px;border-top:1px solid #eeede7;color:#7d827e;font-size:12px">
        ${escape(s.siteName)} · <a href="${site}" style="color:#7d827e">${site.replace(/^https?:\/\//, "")}</a>${contact ? `<br>${contact}` : ""}${s.storeAddress ? `<br>${escape(s.storeAddress).replace(/\r?\n/g, "<br>")}` : ""}
      </div>
    </div>
  </div>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:22px 0"><a href="${escape(href)}" style="background:#183147;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">${escape(label)}</a></p>`;

function itemsTable(order: Order, items: Item[], totalLabel = "Total paid") {
  const rows = items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0">${escape(i.name)} · Size ${escape(i.size)} × ${i.quantity}</td><td style="padding:6px 0;text-align:right">${money(i.price * i.quantity)}</td></tr>`,
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
    ${order.shipping ? `<tr><td>Shipping</td><td style="text-align:right">${money(order.shipping)}</td></tr>` : ""}
    <tr><td style="padding-top:10px;border-top:1px solid #e5e4dd"><b>${totalLabel}</b></td>
        <td style="padding-top:10px;border-top:1px solid #e5e4dd;text-align:right"><b>${money(order.total)}</b></td></tr>
  </table>`;
}

/** Red notice at the top of every email about a demo order. */
const demoNotice = (order: Order) =>
  order.isDemo
    ? `<p style="background:#fdecea;color:#9b2c1f;border:1px solid #f3c2bb;border-radius:8px;padding:10px 14px;font-size:14px;margin:0 0 16px"><b>DEMO ORDER</b> — no payment was taken and nothing will be shipped. It is deleted automatically after 1 minute.</p>`
    : "";
const demoTag = (order: Order) => (order.isDemo ? "[DEMO] " : "");

const orderItems = (orderId: string) =>
  getDb().select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));

// ---------------------------------------------------------------- order emails

/** To the customer when the payment is confirmed. Returns false when email isn't set up. */
export async function sendOrderConfirmation(order: Order, items: Item[]): Promise<boolean> {
  if (!emailConfigured()) return false;
  const s = await getSettings();
  const site = serverEnv.emailSiteUrl();
  const html = layout(
    s,
    `${demoNotice(order)}<h2 style="color:#193547;margin-top:0">Thank you, ${escape(order.customer)}!</h2>
     <p>Your ${order.isDemo ? "demo " : ""}order <b>${order.id}</b> is confirmed${order.isDemo ? "" : " and we are getting it ready"}.</p>
     ${itemsTable(order, items, order.isDemo ? "Total (demo — not paid)" : "Total paid")}
     <p style="margin-top:18px"><b>Delivering to</b><br>${escape(order.address)}<br>PIN ${escape(order.pincode)}</p>
     ${button(`${site}/account/orders/${encodeURIComponent(order.id)}`, "View your order")}
     <p style="color:#7d827e;font-size:13px">Questions? Just reply to this email.</p>`,
  );
  return sendMail({
    to: order.email,
    subject: `${demoTag(order)}Your ${s.siteName} order ${order.id} is confirmed`,
    html,
    kind: "order-confirmation",
  });
}

/**
 * To every active team member who turned on "Email me new orders"
 * (never the store owner address). Failures go to the error log.
 */
export async function sendTeamNewOrder(order: Order, items: Item[]) {
  const s = await getSettings();
  if (!s.emailTeamNewOrder || !emailConfigured()) return;
  const team = await getDb()
    .select({ email: schema.staffMembers.email })
    .from(schema.staffMembers)
    .where(and(eq(schema.staffMembers.active, true), eq(schema.staffMembers.notifyOrders, true)));
  const to = team.map((t) => t.email).filter((e): e is string => !!e && !isOwnerEmail(e));
  if (!to.length) return;
  const link = `${serverEnv.emailSiteUrl()}${adminHref(`orders/${encodeURIComponent(order.id)}`)}`;
  const html = layout(
    s,
    `${demoNotice(order)}<h2 style="color:#193547;margin-top:0">New ${order.isDemo ? "demo " : ""}order ${order.id}</h2>
     <p><b>${escape(order.customer)}</b> · ${escape(order.phone)} · ${escape(order.email)}</p>
     ${itemsTable(order, items, order.isDemo ? "Total (demo — not paid)" : "Total paid")}
     <p style="margin-top:18px"><b>Ship to</b><br>${escape(order.address)}<br>PIN ${escape(order.pincode)}</p>
     ${button(link, "Open in dashboard")}`,
  );
  await Promise.all(
    to.map((email) =>
      trySend("team-new-order", order.id, {
        to: email,
        subject: `${demoTag(order)}🛍️ New order ${order.id} — ${money(order.total)}`,
        html,
        replyTo: order.email,
      }),
    ),
  );
}

const statusText: Partial<Record<OrderStatus, { title: string; text: string }>> = {
  packed: {
    title: "Your order is packed",
    text: "Your order is packed and will be handed to the courier soon.",
  },
  shipped: {
    title: "Your order is on its way",
    text: "Good news — your order has left us and is on its way to you.",
  },
  delivered: {
    title: "Your order was delivered",
    text: "Your order has been delivered. We hope your little one loves it!",
  },
  cancelled: { title: "Your order was cancelled", text: "Your order has been cancelled." },
  refunded: {
    title: "Your refund is on its way",
    text: "We have refunded your payment. It usually reaches your account in 5–7 working days.",
  },
  needs_refund: {
    title: "We’re refunding your order",
    text: "Sorry — an item sold out before your payment arrived. We’ll refund you in full shortly.",
  },
};

/** To the customer whenever staff change the order status (Settings → Emails). */
export async function sendStatusUpdate(orderId: string, status: OrderStatus, note = "") {
  const s = await getSettings();
  const copy = statusText[status];
  if (!s.emailOrderStatus || !copy || !emailConfigured()) return;
  const [order] = await getDb().select().from(schema.orders).where(eq(schema.orders.id, orderId)).limit(1);
  if (!order) return;
  const items = await orderItems(orderId);
  const site = serverEnv.emailSiteUrl();
  const tracking =
    status === "shipped" && (order.courier || order.trackingNumber)
      ? `<p><b>Courier:</b> ${escape(order.courier || "—")}<br><b>Tracking number:</b> ${escape(order.trackingNumber || "—")}</p>
         ${order.trackingUrl ? button(order.trackingUrl, "Track your parcel") : ""}`
      : "";
  const html = layout(
    s,
    `<h2 style="color:#193547;margin-top:0">${copy.title}</h2>
     <p>Hi ${escape(order.customer)}, ${copy.text}</p>
     <p>Order <b>${order.id}</b> · Status: <b>${statusLabels[status]}</b></p>
     ${note && status !== "delivered" ? `<p style="background:#f6f4ef;padding:10px 14px;border-radius:8px">${escape(note)}</p>` : ""}
     ${tracking}
     ${itemsTable(order, items, status === "refunded" ? "Refunded" : "Total")}
     ${button(`${site}/account/orders/${encodeURIComponent(order.id)}`, "View your order")}`,
  );
  await trySend("status-update", orderId, {
    to: order.email,
    subject: `${copy.title} · ${order.id}`,
    html,
  });
}

// ---------------------------------------------------------------- account emails

/** "New sign-in to your account" (Settings → Emails → Login alerts). */
export async function sendLoginAlert(to: string, name: string, info: { ip: string; device: string }) {
  const s = await getSettings();
  if (!s.emailLoginAlert || !emailConfigured()) return;
  const when = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const html = layout(
    s,
    `<h2 style="color:#193547;margin-top:0">New sign-in to ${escape(s.siteName)}</h2>
     <p>Hi ${escape(name || "there")}, your account was just signed in to.</p>
     <p style="background:#f6f4ef;padding:10px 14px;border-radius:8px;font-size:14px">
       <b>When:</b> ${when} (IST)<br><b>Device:</b> ${escape(info.device)}<br><b>IP address:</b> ${escape(info.ip)}
     </p>
     <p>If this was you, there’s nothing to do. If it wasn’t, sign out of Google on devices you don’t recognise and change your Google password.</p>`,
  );
  await trySend("login-alert", to, { to, subject: `New sign-in to ${s.siteName}`, html });
}

/** 6-digit code for "Continue with email". Throws if it can't be sent. */
export async function sendLoginCode(to: string, code: string, minutes: number) {
  const s = await getSettings();
  const html = layout(
    s,
    `<h2 style="color:#193547;margin-top:0">Your sign-in code</h2>
     <p>Enter this code on ${escape(s.siteName)} to sign in. It expires in ${minutes} minutes.</p>
     <p style="font-size:30px;letter-spacing:8px;font-weight:bold;color:#183147;margin:18px 0">${code}</p>
     <p style="color:#7d827e;font-size:13px">Didn’t try to sign in? You can ignore this email — nobody can sign in without this code. Never share it with anyone, including our team.</p>`,
  );
  const sent = await sendMail({
    to,
    subject: `${code} is your ${s.siteName} sign-in code`,
    html,
    kind: "sign-in-code",
  });
  if (!sent) throw new Error("Email is not set up.");
}

/** One-time code for "Forgot dashboard password". Throws if it can't be sent. */
export async function sendDashboardResetCode(to: string, code: string) {
  const s = await getSettings();
  const html = layout(
    s,
    `<h2 style="color:#193547;margin-top:0">Reset your dashboard password</h2>
     <p>Use this code to set a new dashboard password. It expires in 10 minutes.</p>
     <p style="font-size:30px;letter-spacing:8px;font-weight:bold;color:#183147;margin:18px 0">${code}</p>
     <p style="color:#7d827e;font-size:13px">Didn’t ask for this? Ignore this email — your password stays the same. Never share this code.</p>`,
  );
  const sent = await sendMail({
    to,
    subject: `${code} is your ${s.siteName} dashboard reset code`,
    html,
    kind: "dashboard-reset",
  });
  if (!sent) throw new Error("Email is not set up.");
}

// ---------------------------------------------------------------- refund requests

type RefundRequestRow = typeof schema.refundRequests.$inferSelect;

/**
 * Who to email about a request: active team members who can approve requests
 * ("approvers"), or also those who handle orders ("orders"), plus the store
 * owner. Never the person who made the request.
 */
export async function teamAddresses(who: "approvers" | "orders", except?: string | null) {
  const team = await getDb()
    .select({
      email: schema.staffMembers.email,
      role: schema.staffMembers.role,
      permissions: schema.staffMembers.permissions,
      accessMode: schema.staffMembers.accessMode,
    })
    .from(schema.staffMembers)
    .where(eq(schema.staffMembers.active, true));
  const list = team
    .filter((m) => can(m, "requests") || (who === "orders" && can(m, "orders")))
    .map((m) => m.email);
  list.push(serverEnv.storeOwnerEmail());
  const skip = except?.toLowerCase();
  return [...new Set(list.filter((e): e is string => !!e).map((e) => e.toLowerCase()))].filter(
    (e) => e !== skip,
  );
}

function refundLinesTable(r: RefundRequestRow) {
  const rows = r.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0">${escape(i.name)} · Size ${escape(i.size)} × ${i.quantity}</td><td style="padding:6px 0;text-align:right">${money(i.price * i.quantity)}</td></tr>`,
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
    <tr><td style="padding-top:10px;border-top:1px solid #e5e4dd"><b>Refund amount${r.wholeOrder ? " (whole order)" : ""}</b></td>
        <td style="padding-top:10px;border-top:1px solid #e5e4dd;text-align:right"><b>${money(r.amount)}</b></td></tr>
  </table>`;
}

const reasonBox = (r: RefundRequestRow) =>
  `<p style="background:#f6f4ef;padding:10px 14px;border-radius:8px"><b>Reason:</b> ${escape(r.reason)}${r.details ? `<br>${escape(r.details)}` : ""}</p>`;

/** New customer refund request → team members who handle orders, and a receipt to the customer. */
export async function sendRefundRequested(order: Order, r: RefundRequestRow) {
  const s = await getSettings();
  if (!emailConfigured()) return;
  const link = `${serverEnv.emailSiteUrl()}${adminHref(`orders/${encodeURIComponent(order.id)}`)}`;
  const teamHtml = layout(
    s,
    `${demoNotice(order)}<h2 style="color:#193547;margin-top:0">Refund requested · ${order.id}</h2>
     <p><b>${escape(order.customer)}</b> · ${escape(order.phone)} · ${escape(order.email)}</p>
     ${reasonBox(r)}
     ${refundLinesTable(r)}
     <p>Please check the reason and verify it so an admin can approve the refund.</p>
     ${button(link, "Review the request")}`,
  );
  const team = await teamAddresses("orders");
  await Promise.all(
    team.map((to) =>
      trySend("refund-requested", order.id, {
        to,
        subject: `${demoTag(order)}↩️ Refund requested — ${order.id} (${money(r.amount)})`,
        html: teamHtml,
        replyTo: order.email,
      }),
    ),
  );
  const customerHtml = layout(
    s,
    `${demoNotice(order)}<h2 style="color:#193547;margin-top:0">We received your refund request</h2>
     <p>Hi ${escape(order.customer)}, thanks for letting us know. Our team will review your request for order <b>${order.id}</b> and email you as soon as it’s decided.</p>
     ${reasonBox(r)}
     ${refundLinesTable(r)}
     ${button(`${serverEnv.emailSiteUrl()}/account/orders/${encodeURIComponent(order.id)}`, "View your order")}`,
  );
  await trySend("refund-received", order.id, {
    to: order.email,
    subject: `${demoTag(order)}Refund request received · ${order.id}`,
    html: customerHtml,
  });
}

/** Staff verified a request → admins are asked to approve. */
export async function sendRefundVerified(order: Order, r: RefundRequestRow, verifierEmail?: string | null) {
  const s = await getSettings();
  if (!emailConfigured()) return;
  const link = `${serverEnv.emailSiteUrl()}${adminHref("requests")}`;
  const html = layout(
    s,
    `${demoNotice(order)}<h2 style="color:#193547;margin-top:0">Refund waiting for your approval · ${order.id}</h2>
     <p>${escape(r.verifiedBy ?? "A staff member")} checked this request and passed it on${r.staffNote ? `: “${escape(r.staffNote)}”` : "."}</p>
     ${reasonBox(r)}
     ${refundLinesTable(r)}
     ${button(link, "Approve or reject")}`,
  );
  const admins = await teamAddresses("approvers", verifierEmail);
  await Promise.all(
    admins.map((to) =>
      trySend("refund-verified", order.id, {
        to,
        subject: `${demoTag(order)}Approve refund? ${order.id} (${money(r.amount)})`,
        html,
      }),
    ),
  );
}

/** Admin decision → customer. */
export async function sendRefundDecision(order: Order, r: RefundRequestRow) {
  const s = await getSettings();
  if (!emailConfigured()) return;
  const approved = r.status === "approved";
  const html = layout(
    s,
    `${demoNotice(order)}<h2 style="color:#193547;margin-top:0">${approved ? "Your refund is approved" : "About your refund request"}</h2>
     <p>Hi ${escape(order.customer)}, ${
       approved
         ? `good news — your refund request for order <b>${order.id}</b> has been approved. We’ll send <b>${money(r.amount)}</b> back to your original payment method; it usually reaches you in 5–7 working days.`
         : `we’ve reviewed your refund request for order <b>${order.id}</b> and unfortunately we can’t approve it.`
     }</p>
     ${r.decisionNote ? `<p style="background:#f6f4ef;padding:10px 14px;border-radius:8px">${escape(r.decisionNote)}</p>` : ""}
     ${refundLinesTable(r)}
     <p style="color:#7d827e;font-size:13px">Questions? Just reply to this email.</p>`,
  );
  await trySend("refund-decision", order.id, {
    to: order.email,
    subject: `${demoTag(order)}${approved ? "Refund approved" : "Refund request update"} · ${order.id}`,
    html,
  });
}

/**
 * Where a refund's money is: "initiated" (sent to Razorpay, usually 5–7 working days),
 * "processed" (it reached the customer) or "failed" (it bounced; we'll sort it out).
 * Uses Settings → Emails → order status emails.
 */
export async function sendRefundProgress(razorpayRefundId: string, opts: { skipInitiated?: boolean } = {}) {
  const s = await getSettings();
  if (!s.emailOrderStatus || !emailConfigured()) return;
  const [r] = await getDb()
    .select()
    .from(schema.orderRefunds)
    .where(eq(schema.orderRefunds.razorpayRefundId, razorpayRefundId))
    .limit(1);
  if (!r || r.status === "pending") return;
  // A just-approved request's email already says the money is on its way.
  if (opts.skipInitiated && r.gatewayStatus === "initiated") return;
  const [order] = await getDb().select().from(schema.orders).where(eq(schema.orders.id, r.orderId)).limit(1);
  if (!order) return;
  const site = serverEnv.emailSiteUrl();
  const state = r.gatewayStatus;
  const copy = {
    initiated: {
      title: "Your refund is on its way",
      text: `we’ve sent <b>${money(r.amount)}</b> for order <b>${order.id}</b> back to your original payment method. It usually reaches you in 5–7 working days — we’ll email you again when it arrives.`,
    },
    processed: {
      title: "Your refund has been processed",
      text: `<b>${money(r.amount)}</b> for order <b>${order.id}</b> has been refunded to your original payment method. Depending on your bank it can take a little while to show in your statement.`,
    },
    failed: {
      title: "We couldn’t complete your refund yet",
      text: `the refund of <b>${money(r.amount)}</b> for order <b>${order.id}</b> didn’t go through. Don’t worry — our team has been alerted and will send it again or contact you.`,
    },
  }[state];
  const pieces = r.items.length
    ? `<p style="color:#7d827e;font-size:13px">${r.items.map((l) => `${escape(l.name)} (${escape(l.size)}) × ${l.quantity}`).join(", ")}</p>`
    : "";
  const html = layout(
    s,
    `${demoNotice(order)}<h2 style="color:#193547;margin-top:0">${copy.title}</h2>
     <p>Hi ${escape(order.customer)}, ${copy.text}</p>
     ${pieces}
     <p>Refund reference: <b>${escape(r.razorpayRefundId ?? "—")}</b></p>
     ${button(`${site}/account/orders/${encodeURIComponent(order.id)}`, "View your order")}`,
  );
  await trySend(`refund-${state}`, order.id, {
    to: order.email,
    subject: `${demoTag(order)}${copy.title} · ${order.id}`,
    html,
  });
}

// ---------------------------------------------------------------- staff requests

type ApprovalRow = typeof schema.approvalRequests.$inferSelect;
const requestTitles: Record<ApprovalRow["type"], string> = {
  refund: "Refund order",
  delete_order: "Delete order",
  delete_product: "Delete product",
  delete_category: "Delete category",
};

/** What the request is about, in words (order total / product or category name). */
async function requestTarget(req: ApprovalRow) {
  const db = getDb();
  const id = escape(req.targetId);
  if (req.type === "refund" || req.type === "delete_order") {
    const [o] = await db
      .select({ customer: schema.orders.customer, total: schema.orders.total, status: schema.orders.status })
      .from(schema.orders)
      .where(eq(schema.orders.id, req.targetId))
      .limit(1);
    return o
      ? `Order <b>${id}</b> · ${escape(o.customer)} · ${money(o.total)} · ${escape(statusLabels[o.status] ?? o.status)}`
      : `Order <b>${id}</b>`;
  }
  if (req.type === "delete_product") {
    const [p] = await db
      .select({ name: schema.products.name })
      .from(schema.products)
      .where(eq(schema.products.id, req.targetId))
      .limit(1);
    return `Product <b>${escape(p?.name ?? req.targetId)}</b> (${id})`;
  }
  const [c] = await db
    .select({ name: schema.categories.name })
    .from(schema.categories)
    .where(eq(schema.categories.id, req.targetId))
    .limit(1);
  return `Category <b>${escape(c?.name ?? req.targetId)}</b>`;
}

/** A staff member asked for something they can't do themselves → admins who approve, and the owner. */
export async function sendTeamRequest(req: ApprovalRow, requesterEmail?: string | null) {
  if (!emailConfigured()) return;
  const s = await getSettings();
  const to = await teamAddresses("approvers", requesterEmail);
  if (!to.length) return;
  const title = requestTitles[req.type];
  const html = layout(
    s,
    `<h2 style="color:#193547;margin-top:0">Waiting for your approval: ${title.toLowerCase()}</h2>
     <p>${await requestTarget(req)}</p>
     ${req.type === "refund" ? `<p><b>Amount:</b> ${req.amount ? money(req.amount) : "full refund (everything left on the order)"}</p>` : ""}
     <p style="background:#f6f4ef;padding:10px 14px;border-radius:8px"><b>Reason:</b> ${escape(req.reason)}</p>
     <p style="color:#7d827e;font-size:13px">Asked by ${escape(req.requestedBy)}</p>
     ${button(`${serverEnv.emailSiteUrl()}${adminHref("requests")}`, "Approve or reject")}`,
  );
  await Promise.all(
    to.map((email) =>
      trySend("team-request", req.id, {
        to: email,
        subject: `Approval needed: ${title} · ${req.targetId}`,
        html,
        replyTo: requesterEmail ?? undefined,
      }),
    ),
  );
}
