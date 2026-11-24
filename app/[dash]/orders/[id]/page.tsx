import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { orderHistory, refundsFor } from "@/lib/admin/orders";
import { money } from "@/lib/catalog";
import { nextStatuses, statusLabels } from "@/lib/order-status";
import { orderWithItems } from "@/lib/store-data";
import { adminHref, can, requirePage } from "@/lib/staff";
import { payoutsFor, refundStatusLabels, requestsForOrder } from "@/lib/refunds";
import { ActionForm } from "@/components/dashboard/action-form";
import { RefundRequestCard } from "@/components/dashboard/refund-request-card";
import { deleteOrderAction, orderStatusAction, refundAction, shippingAction } from "../../actions";

const fmt = (d: Date | null) =>
  d ? d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

function deleteHint(status: string, demo: boolean) {
  if (demo) return "Demo order: deleting undoes everything it changed (stock, sales, history).";
  if (["paid", "packed"].includes(status))
    return "The order hasn’t left the shop, so its pieces go back into stock. Refund first if the customer paid.";
  if (["shipped", "delivered", "refunded"].includes(status))
    return "Stock is not changed (the parcel already left the shop). The order disappears from sales.";
  return "Removes this unpaid order and its history.";
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePage("orders");
  const id = decodeURIComponent((await params).id);
  const [order, history, refunds, paidRefunds] = await Promise.all([
    orderWithItems(id),
    orderHistory(id),
    requestsForOrder(id),
    refundsFor([id]),
  ]);
  if (!order) notFound();
  const payouts = await payoutsFor(refunds.map((r) => r.id));
  /** Money not refunded yet. */
  const left = order.total - order.refundedAmount;
  const next = nextStatuses[order.status] ?? [];
  const refundable =
    ["paid", "packed", "shipped", "delivered", "needs_refund"].includes(order.status) &&
    !!order.razorpayPaymentId &&
    left > 0;
  const canRefund = can(staff, "refunds");
  /** Deletes straight away (otherwise sends a request). */
  const isAdmin = can(staff, "delete_records");

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
        {order.isDemo && (
          <span className="status-pill big demo-pill">DEMO — not paid, deleted after 1 minute</span>
        )}
        {order.refundRequest && (
          <span className={`status-pill big refund-pill refund-${order.refundRequest}`}>
            {refundStatusLabels[order.refundRequest]}
          </span>
        )}
      </div>

      <div className="dash-grid">
        {refunds.length > 0 && (
          <section className="dash-panel wide refund-panel" id="refund-requests">
            <h2>Customer refund requests</h2>
            {refunds.map((r) => (
              <RefundRequestCard
                key={r.id}
                r={r}
                isAdmin={can(staff, "requests")}
                canVerify={can(staff, "orders")}
                payout={payouts.get(r.id)}
              />
            ))}
          </section>
        )}
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
          </p>
          {paidRefunds.length > 0 && (
            <>
              <h2>
                Refunds{" "}
                <small className="muted">
                  · {money(order.refundedAmount)} of {money(order.total)}
                </small>
              </h2>
              <ul className="refund-history">
                {paidRefunds.map((r) => (
                  <li key={r.id}>
                    <b>{money(r.amount)}</b> · {fmt(r.createdAt)}{" "}
                    <span className={"status-pill refund-state refund-state-" + r.gatewayStatus}>
                      {r.gatewayStatus === "processed"
                        ? `Refunded${r.processedAt ? " · " + fmt(r.processedAt) : ""}`
                        : r.gatewayStatus === "failed"
                          ? "Failed — not refunded"
                          : "Initiated — on its way"}
                    </span>
                    {r.failureReason && <small className="block form-error">{r.failureReason}</small>}
                    <small className="block muted">
                      {r.razorpayRefundId} · {r.actor}
                      {r.items.length > 0 && (
                        <> · {r.items.map((l) => `${l.name} (${l.size}) × ${l.quantity}`).join(", ")}</>
                      )}
                      {r.reason && <> · {r.reason}</>}
                    </small>
                  </li>
                ))}
              </ul>
            </>
          )}
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
                ? `Sends money back to the customer through Razorpay. ${money(left)} can still be refunded${order.refundedAmount ? ` (${money(order.refundedAmount)} already refunded)` : ""}.`
                : `An admin will review and approve it. ${money(left)} can still be refunded.`}
            </p>
            <ActionForm
              action={refundAction}
              confirm={canRefund ? `Send this refund for ${order.id}? This cannot be undone.` : undefined}
            >
              <input type="hidden" name="orderId" value={order.id} />
              <label>
                Amount (₹) — leave empty {canRefund ? "to refund" : "to ask for"} all {money(left)}
                <input name="amount" type="number" min={1} max={left} step={1} placeholder={String(left)} />
              </label>
              <label>
                Reason
                <input name="reason" required maxLength={500} />
              </label>
              <button className={canRefund ? "primary danger" : "outline"}>
                {canRefund ? "Send refund" : "Send refund request"}
              </button>
            </ActionForm>
          </section>
        )}

        <section className="dash-panel danger-zone">
          <h2>Delete order</h2>
          {order.status === "pending_payment" && !order.isDemo ? (
            <p className="muted">
              This order is still waiting for payment. It can be deleted once it expires (30 minutes).
            </p>
          ) : (
            <>
              <p className="muted">
                {isAdmin
                  ? deleteHint(order.status, order.isDemo)
                  : "An admin will review your request before the order is deleted."}
              </p>
              <ActionForm
                action={deleteOrderAction}
                confirm={
                  isAdmin
                    ? `Delete order ${order.id} permanently?${
                        ["paid", "packed", "shipped", "delivered"].includes(order.status) && !order.isDemo
                          ? " It was paid — it will disappear from sales and can no longer be refunded here."
                          : ""
                      }`
                    : undefined
                }
              >
                <input type="hidden" name="orderId" value={order.id} />
                <label>
                  Reason {isAdmin && <small className="muted">(optional, saved in the activity log)</small>}
                  <input name="reason" maxLength={500} required={!isAdmin} />
                </label>
                <button className={isAdmin ? "primary danger" : "outline"}>
                  {isAdmin ? "Delete order" : "Send delete request"}
                </button>
              </ActionForm>
            </>
          )}
        </section>

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
