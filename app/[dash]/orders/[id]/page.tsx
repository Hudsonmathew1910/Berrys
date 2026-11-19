import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { orderHistory } from "@/lib/admin/orders";
import { money } from "@/lib/catalog";
import { nextStatuses, statusLabels } from "@/lib/order-status";
import { orderWithItems } from "@/lib/store-data";
import { adminHref, can, requirePage } from "@/lib/staff";
import { ActionForm } from "@/components/dashboard/action-form";
import { orderStatusAction, refundAction, shippingAction } from "../../actions";

const fmt = (d: Date | null) =>
  d ? d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePage("orders");
  const id = decodeURIComponent((await params).id);
  const [order, history] = await Promise.all([orderWithItems(id), orderHistory(id)]);
  if (!order) notFound();
  const next = nextStatuses[order.status] ?? [];
  const refundable =
    ["paid", "packed", "shipped", "delivered", "needs_refund"].includes(order.status) &&
    !!order.razorpayPaymentId;
  const canRefund = can(staff, "refunds");

  return (
    <div className="dash-page">
      <Link className="text-link" href={adminHref("orders")}>
        <ArrowLeft size={15} /> All orders
      </Link>
      <div className="dash-heading">
        <div>
          <h1>Order {order.id}</h1>
          <span className="muted">Placed {fmt(order.createdAt)}</span>
        </div>
        <span className={"status-pill big status-" + order.status}>{statusLabels[order.status]}</span>
      </div>

      <div className="dash-grid">
        <section className="dash-panel wide">
          <h2>Items</h2>
          <ul className="dash-list">
            {order.items.map((i) => (
              <li key={i.id}>
                {i.image && <img src={i.image} alt="" />}
                <span>
                  {i.name}
                  <small>
                    {i.category} · Size {i.size} × {i.quantity} · {money(i.price)} each
                  </small>
                </span>
                <b>{money(i.price * i.quantity)}</b>
              </li>
            ))}
          </ul>
          <div className="dash-totals">
            <span>Subtotal {money(order.subtotal)}</span>
            <span>Shipping {order.shipping ? money(order.shipping) : "Free"}</span>
            <b>Total {money(order.total)}</b>
          </div>
        </section>

        <section className="dash-panel">
          <h2>Customer & delivery</h2>
          <p>
            <b>{order.customer}</b>
            <br />
            {order.email}
            <br />
            {order.phone}
          </p>
          <p>
            {order.address}
            <br />
            PIN {order.pincode}
          </p>
          <h2>Payment</h2>
          <p className="muted">
            {order.razorpayPaymentId ?? "Not paid"}
            <br />
            Paid {fmt(order.paidAt)}
            {order.refundId && (
              <>
                <br />
                Refund {order.refundId} · {fmt(order.refundedAt)}
              </>
            )}
          </p>
        </section>

        <section className="dash-panel">
          <h2>Update status</h2>
          {next.length ? (
            <ActionForm action={orderStatusAction}>
              <input type="hidden" name="orderId" value={order.id} />
              <label>
                Mark as
                <select name="status" defaultValue={next[0]}>
                  {next.map((s) => (
                    <option key={s} value={s}>
                      {statusLabels[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Note (optional)
                <input name="note" maxLength={500} />
              </label>
              <button className="primary">Update</button>
            </ActionForm>
          ) : (
            <p className="muted">No further steps for a {statusLabels[order.status].toLowerCase()} order.</p>
          )}
        </section>

        <section className="dash-panel">
          <h2>Shipping & notes</h2>
          <ActionForm action={shippingAction}>
            <input type="hidden" name="orderId" value={order.id} />
            <label>
              Courier
              <input
                name="courier"
                defaultValue={order.courier}
                maxLength={80}
                placeholder="e.g. Delhivery"
              />
            </label>
            <label>
              Tracking number
              <input name="trackingNumber" defaultValue={order.trackingNumber} maxLength={80} />
            </label>
            <label>
              Tracking link
              <input name="trackingUrl" type="url" defaultValue={order.trackingUrl} placeholder="https://…" />
            </label>
            <label>
              Internal note (staff only)
              <textarea name="staffNote" defaultValue={order.staffNote} maxLength={2000} />
            </label>
            <button className="outline">Save shipping details</button>
          </ActionForm>
        </section>

        {refundable && (
          <section className="dash-panel">
            <h2>{canRefund ? "Refund" : "Request a refund"}</h2>
            <p className="muted">
              {canRefund
                ? `Refunds the full ${money(order.total)} to the customer through Razorpay.`
                : "An admin will review and approve the refund."}
            </p>
            <ActionForm
              action={refundAction}
              confirm={
                canRefund ? `Refund ${money(order.total)} for ${order.id}? This cannot be undone.` : undefined
              }
            >
              <input type="hidden" name="orderId" value={order.id} />
              <label>
                Reason
                <input name="reason" required maxLength={500} />
              </label>
              <button className={canRefund ? "primary danger" : "outline"}>
                {canRefund ? "Refund order" : "Send refund request"}
              </button>
            </ActionForm>
          </section>
        )}

        <section className="dash-panel wide">
          <h2>Order history</h2>
          <ol className="dash-history">
            {history.map((h) => (
              <li key={h.id}>
                <b>{statusLabels[h.status as keyof typeof statusLabels] ?? h.status.replace(/_/g, " ")}</b>
                <span>{h.note}</span>
                <small>
                  {fmt(h.createdAt)} · {h.actor}
                </small>
              </li>
            ))}
          </ol>
          {!history.length && (
            <p className="muted">No history recorded (order placed before history tracking).</p>
          )}
        </section>
      </div>
    </div>
  );
}
