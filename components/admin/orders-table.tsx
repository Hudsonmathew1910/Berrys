"use client";
import Link from "next/link";
import { ArrowRight, ShoppingBag } from "lucide-react";
import type { OrderStatus } from "@/db/schema";
import { money } from "@/lib/catalog";
import { statusLabels, type AdminOrder } from "./types";

const nextSteps: Partial<Record<OrderStatus, OrderStatus[]>> = {
  paid: ["packed", "shipped", "delivered"],
  packed: ["shipped", "delivered"],
  shipped: ["delivered"],
  needs_refund: ["cancelled"],
};

export function OrdersTable({
  orders,
  compact,
  busy,
  onStatus,
}: {
  orders: AdminOrder[];
  compact: boolean;
  busy: boolean;
  onStatus: (id: string, status: OrderStatus) => void;
}) {
  const shown = compact ? orders.slice(0, 5) : orders;
  return (
    <section className="admin-panel orders-panel">
      <div className="panel-heading">
        <div>
          <h3>{compact ? "The latest little orders" : "All orders"}</h3>
          <p>Paid orders can be moved through packing, shipping and delivery.</p>
        </div>
        <span>{orders.length} orders</span>
      </div>
      {!orders.length ? (
        <div className="orders-empty">
          <ShoppingBag size={28} />
          <h3>Your first order is a little adventure away.</h3>
          <p>Orders appear here as soon as a customer starts checkout.</p>
          <Link className="text-link" href="/">
            Explore the store <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ORDER</th>
                <th>CUSTOMER</th>
                {!compact && <th>DELIVER TO</th>}
                <th>DATE</th>
                <th>VALUE</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => (
                <tr key={o.id}>
                  <td>
                    <b>{o.id}</b>
                    {o.razorpayPaymentId && <small className="block">{o.razorpayPaymentId}</small>}
                  </td>
                  <td>
                    {o.customer}
                    <small className="block">{o.email}</small>
                    <small className="block">{o.phone}</small>
                  </td>
                  {!compact && (
                    <td className="address-cell">
                      {o.address}
                      <small className="block">PIN {o.pincode}</small>
                    </td>
                  )}
                  <td>{new Date(o.createdAt).toLocaleDateString("en-IN")}</td>
                  <td>{money(o.total)}</td>
                  <td>
                    <span className={"status-pill status-" + o.status}>{statusLabels[o.status]}</span>
                    {!compact && nextSteps[o.status] && (
                      <select
                        className="status-select"
                        aria-label={`Update status of ${o.id}`}
                        value=""
                        disabled={busy}
                        onChange={(e) => e.target.value && onStatus(o.id, e.target.value as OrderStatus)}
                      >
                        <option value="">Mark as…</option>
                        {nextSteps[o.status]!.map((s) => (
                          <option key={s} value={s}>
                            {s === "cancelled" ? "Refunded & closed" : statusLabels[s]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
