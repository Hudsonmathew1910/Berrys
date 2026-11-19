import Link from "next/link";
import { AlertCircle, ArrowRight } from "lucide-react";
import { lowStock } from "@/lib/admin/catalog";
import { listOrders } from "@/lib/admin/orders";
import { orderStatusCounts, salesByDay, salesSummary, trendingProducts } from "@/lib/admin/insights";
import { pendingRequestCount } from "@/lib/admin/team";
import { money } from "@/lib/catalog";
import { statusLabels } from "@/lib/order-status";
import { adminHref, can, requirePage } from "@/lib/staff";
import { DayBars, pctChange, Stat } from "@/components/dashboard/charts";

export default async function OverviewPage() {
  const staff = await requirePage();
  const seeSales = can(staff, "analytics");
  const seeOrders = can(staff, "orders");
  const seeStock = can(staff, "stock") || can(staff, "products");
  const [summary, days, trending, counts, recent, low, pending] = await Promise.all([
    seeSales ? salesSummary(30) : null,
    seeSales ? salesByDay(30) : null,
    seeSales ? trendingProducts(5) : null,
    seeOrders ? orderStatusCounts() : null,
    seeOrders ? listOrders({ page: 1 }) : null,
    seeStock ? lowStock(3, 8) : null,
    staff.role === "admin" ? pendingRequestCount() : 0,
  ]);
  const toShip = counts ? (counts.paid ?? 0) + (counts.packed ?? 0) : 0;

  return (
    <div className="dash-page">
      <div className="dash-heading">
        <div>
          <div className="eyebrow">A LITTLE CLARITY, EVERY DAY</div>
          <h1>Hello{staff.name ? `, ${staff.name.split(" ")[0]}` : ""}.</h1>
        </div>
      </div>

      {(toShip > 0 || (counts?.needs_refund ?? 0) > 0 || pending > 0) && (
        <div className="dash-alerts">
          {toShip > 0 && (
            <Link href={adminHref("orders?status=open")}>
              <AlertCircle size={16} /> {toShip} orders to pack & ship
            </Link>
          )}
          {(counts?.needs_refund ?? 0) > 0 && (
            <Link href={adminHref("orders?status=needs_refund")}>
              <AlertCircle size={16} /> {counts!.needs_refund} orders need a refund
            </Link>
          )}
          {pending > 0 && (
            <Link href={adminHref("requests")}>
              <AlertCircle size={16} /> {pending} staff requests waiting for you
            </Link>
          )}
        </div>
      )}

      {summary && (
        <div className="dash-stats">
          <Stat
            label="Revenue · 30 days"
            value={money(summary.revenue)}
            delta={pctChange(summary.revenue, summary.prev.revenue)}
          />
          <Stat
            label="Orders · 30 days"
            value={summary.orders}
            delta={pctChange(summary.orders, summary.prev.orders)}
          />
          <Stat label="Average order" value={money(summary.aov)} />
          <Stat label="Pieces sold" value={summary.units} note={`${summary.customers} customers`} />
        </div>
      )}

      <div className="dash-grid">
        {days && (
          <section className="dash-panel wide">
            <h2>Revenue, last 30 days</h2>
            <DayBars data={days} />
          </section>
        )}
        {trending && (
          <section className="dash-panel">
            <h2>Trending this week</h2>
            {trending.length ? (
              <ul className="dash-list">
                {trending.map((t) => (
                  <li key={t.productId}>
                    {t.image && <img src={t.image} alt="" />}
                    <span>{t.name}</span>
                    <b>
                      {t.recent} sold{t.before ? ` (was ${t.before})` : ""}
                    </b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No sales this week yet.</p>
            )}
            <Link className="text-link" href={adminHref("analytics")}>
              Full analytics <ArrowRight size={14} />
            </Link>
          </section>
        )}
        {low && (
          <section className="dash-panel">
            <h2>Low stock</h2>
            {low.length ? (
              <ul className="dash-list">
                {low.map((l) => (
                  <li key={l.productId + l.size}>
                    <img src={l.image} alt="" />
                    <span>
                      {l.name} <small>Size {l.size}</small>
                    </span>
                    <b className={l.quantity ? "warn" : "danger"}>
                      {l.quantity ? `${l.quantity} left` : "Sold out"}
                    </b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Everything is well stocked.</p>
            )}
            {can(staff, "stock") && (
              <Link className="text-link" href={adminHref("stock")}>
                Manage stock <ArrowRight size={14} />
              </Link>
            )}
          </section>
        )}
        {recent && (
          <section className="dash-panel wide">
            <h2>Latest orders</h2>
            <table className="dash-table">
              <tbody>
                {recent.rows.slice(0, 6).map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={adminHref(`orders/${o.id}`)}>{o.id}</Link>
                    </td>
                    <td>{o.customer}</td>
                    <td>{o.createdAt.toLocaleDateString("en-IN")}</td>
                    <td>{money(o.total)}</td>
                    <td>
                      <span className={"status-pill status-" + o.status}>{statusLabels[o.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!recent.rows.length && <p className="muted">No orders yet.</p>}
          </section>
        )}
      </div>
    </div>
  );
}
