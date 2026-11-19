import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, ExternalLink } from "lucide-react";
import { getViewer } from "@/lib/auth";
import { money } from "@/lib/catalog";
import { formatIndianMobile } from "@/lib/phone";
import { orderForUser } from "@/lib/store-data";
import { statusLabels } from "@/components/admin/types";

export const metadata: Metadata = { title: "Order details — Berry’s", robots: { index: false } };
export const dynamic = "force-dynamic";

const fmt = (d: Date | null) =>
  d ? d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = (await getViewer())!;
  const order = await orderForUser(viewer.userId, decodeURIComponent((await params).id));
  if (!order) notFound();

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
      <Link className="text-link" href="/account/orders">
        <ArrowLeft size={15} /> All orders
      </Link>
      <div className="order-head">
        <div>
          <h1 className="page-title">Order {order.id}</h1>
          <p className="muted">Placed {fmt(order.createdAt)}</p>
        </div>
        <span className={"status-pill status-" + order.status}>{statusLabels[order.status]}</span>
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
    </>
  );
}
