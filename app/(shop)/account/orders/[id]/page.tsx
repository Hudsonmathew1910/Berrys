import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, ExternalLink } from "lucide-react";
import { getViewer } from "@/lib/auth";
import { money } from "@/lib/catalog";
import { formatIndianMobile } from "@/lib/phone";
import { orderForUser } from "@/lib/store-data";
import { statusLabels } from "@/lib/order-status";
import {
  refundBlocker,
  refundProgress,
  refundReasons,
  refundStatusLabels,
  requestsForOrder,
} from "@/lib/refunds";
import { getSettings } from "@/lib/settings";
import { RefundRequestForm } from "@/components/shop/refund-request-form";

export const metadata: Metadata = { title: "Order details — Berry’s", robots: { index: false } };
export const dynamic = "force-dynamic";

const fmt = (d: Date | null) =>
  d ? d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = (await getViewer())!;
  const order = await orderForUser(viewer.userId, decodeURIComponent((await params).id));
  if (!order) notFound();
  const [refunds, settings, sent] = await Promise.all([
    requestsForOrder(order.id),
    getSettings(),
    refundProgress(order.id),
  ]);
  const blocker = refundBlocker(order, settings, refunds);

  const closed = ["cancelled", "expired", "needs_refund"].includes(order.status);
  const steps = [
    { label: "Order placed", at: order.createdAt },
    { label: "Payment confirmed", at: order.paidAt },
    { label: "Packed", at: order.packedAt },
    { label: "Shipped", at: order.shippedAt },
    { label: "Delivered", at: order.deliveredAt },
  ];
  const phone = order.phone.startsWith("+") ? order.phone : `+91${order.phone}`;

  return (
    <>
      <Link className="text-link" href="/account#orders">
        <ArrowLeft size={15} /> All orders
      </Link>
      <div className="order-head">
        <div>
          <h1 className="page-title">Order {order.id}</h1>
          <p className="muted">Placed {fmt(order.createdAt)}</p>
        </div>
        <span className={"status-pill status-" + order.status}>{statusLabels[order.status]}</span>
        {order.isDemo && <span className="status-pill demo-pill">DEMO ORDER</span>}
        {order.refundRequest && (
          <span className={`status-pill refund-pill refund-${order.refundRequest}`}>
            {refundStatusLabels[order.refundRequest]}
          </span>
        )}
      </div>

      {closed ? (
        <div className="admin-notice">
          {order.status === "needs_refund"
            ? "This item sold out before your payment arrived. A full refund is on its way."
            : "This order was not completed and no payment was taken."}
        </div>
      ) : (
        <section className="account-card-box">
          <h2>Shipping progress</h2>
          <ol className="order-timeline">
            {steps.map((s) => (
              <li key={s.label} className={s.at ? "done" : ""}>
                <span className="dot">{s.at && <Check size={12} />}</span>
                <div>
                  <b>{s.label}</b>
                  <small>{s.at ? fmt(s.at) : "Pending"}</small>
                </div>
              </li>
            ))}
          </ol>
          {(order.courier || order.trackingNumber) && (
            <p className="tracking">
              {order.courier && (
                <>
                  Courier: <b>{order.courier}</b> ·{" "}
                </>
              )}
              {order.trackingNumber && (
                <>
                  Tracking no: <b>{order.trackingNumber}</b>
                </>
              )}{" "}
              {order.trackingUrl && /^https:\/\//.test(order.trackingUrl) && (
                <a className="text-link" href={order.trackingUrl} target="_blank" rel="noopener noreferrer">
                  Track package <ExternalLink size={13} />
                </a>
              )}
            </p>
          )}
        </section>
      )}

      <div className="account-cards">
        <section className="account-card-box">
          <h2>Items</h2>
          <ul className="summary-lines">
            {order.items.map((i) => (
              <li key={i.id}>
                {i.image ? <img src={i.image} alt="" /> : <span className="img-placeholder" />}
                <span>
                  <Link href={`/products/${encodeURIComponent(i.productId)}`}>{i.name}</Link>
                  <small>
                    Size {i.size} × {i.quantity} · {money(i.price)} each
                  </small>
                </span>
                <b>{money(i.price * i.quantity)}</b>
              </li>
            ))}
          </ul>
          <div className="subtotal">
            <span>Subtotal</span>
            <b>{money(order.subtotal)}</b>
          </div>
          <div className="subtotal">
            <span>Shipping</span>
            <b>{order.shipping ? money(order.shipping) : "Free"}</b>
          </div>
          <div className="subtotal total">
            <span>Total paid</span>
            <b>{money(order.total)}</b>
          </div>
          {order.refundedAmount > 0 && (
            <div className="subtotal refunded-line">
              <span>Refunded</span>
              <b>−{money(order.refundedAmount)}</b>
            </div>
          )}
        </section>
        <section className="account-card-box">
          <h2>Delivery address</h2>
          <p>
            <b>{order.customer}</b>
            <br />
            {order.address}
            <br />
            PIN {order.pincode}
            <br />
            {formatIndianMobile(phone)}
          </p>
          <h2>Payment</h2>
          <p className="muted">
            {order.razorpayPaymentId ? `Razorpay · ${order.razorpayPaymentId}` : "—"}
            <br />
            Confirmation sent to {order.email}
          </p>
          <p className="muted">
            Need help with this order? <Link href="/help/contact">Contact us</Link>
          </p>
        </section>
      </div>

      {(refunds.length > 0 || sent.length > 0 || !blocker) && (
        <section className="account-card-box refund-box" id="refund">
          <h2>Refunds</h2>
          {sent.map((r) => {
            const failed = r.gatewayStatus === "failed";
            const done = r.gatewayStatus === "processed";
            const steps = [
              { label: "Refund initiated", on: true, at: r.createdAt },
              { label: "Processing", on: done || !failed, at: null },
              failed
                ? { label: "Couldn’t complete", on: true, at: null, bad: true }
                : { label: "Refunded", on: done, at: r.processedAt },
            ];
            return (
              <div key={r.id} className={"refund-track" + (failed ? " failed" : done ? " done" : "")}>
                <div className="refund-track-head">
                  <b>{money(r.amount)}</b>
                  <small>
                    {r.items.length
                      ? r.items.map((l) => `${l.name} (${l.size}) × ${l.quantity}`).join(", ")
                      : "Refund"}
                  </small>
                </div>
                <ol className="refund-steps">
                  {steps.map((s, i) => (
                    <li
                      key={i}
                      className={
                        (s.on ? "on" : "") +
                        ("bad" in s && s.bad ? " bad" : "") +
                        (i === 1 && !done && !failed ? " current" : "")
                      }
                    >
                      <span>{s.label}</span>
                      {s.at && <small>{fmt(s.at)}</small>}
                    </li>
                  ))}
                </ol>
                <p className="muted">
                  {done
                    ? "The money has been sent to your original payment method."
                    : failed
                      ? "This refund didn’t go through. Our team has been alerted and will send it again or contact you."
                      : "On its way to your original payment method — usually 5–7 working days. We’ll email you when it arrives."}
                  {r.razorpayRefundId && <> Reference: {r.razorpayRefundId}</>}
                </p>
              </div>
            );
          })}
          {refunds.map((r) => (
            <div key={r.id} className={`refund-status refund-${r.status}`}>
              <div className="refund-status-head">
                <b>{refundStatusLabels[r.status]}</b>
                <small>{fmt(r.createdAt)}</small>
              </div>
              <p>
                {r.wholeOrder
                  ? "Whole order"
                  : r.items.map((i) => `${i.name} (${i.size}) × ${i.quantity}`).join(", ")}{" "}
                · {money(r.amount)} · {r.reason}
              </p>
              {r.status === "approved" && (
                <p className="muted">
                  Approved — the money goes back to your original payment method (usually 5–7 working days).
                </p>
              )}
              {r.status === "rejected" && r.decisionNote && <p className="muted">{r.decisionNote}</p>}
              {(r.status === "requested" || r.status === "verified") && (
                <p className="muted">Our team is reviewing it. We’ll email you when it’s decided.</p>
              )}
            </div>
          ))}
          {!blocker ? (
            <>
              {settings.returnDays > 0 && order.status === "delivered" && (
                <p className="muted">
                  You can ask for a refund within {settings.returnDays} days of delivery.
                </p>
              )}
              <RefundRequestForm
                orderId={order.id}
                shipping={order.shipping}
                reasons={refundReasons}
                items={order.items.map((i) => ({
                  id: i.id,
                  name: i.name,
                  size: i.size,
                  quantity: i.quantity,
                  price: i.price,
                }))}
              />
            </>
          ) : (
            refunds.length > 0 && <p className="muted">{blocker}</p>
          )}
        </section>
      )}
    </>
  );
}
