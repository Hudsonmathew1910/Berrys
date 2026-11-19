import Link from "next/link";
import { listPayments } from "@/lib/admin/insights";
import { money } from "@/lib/catalog";
import { statusLabels } from "@/lib/order-status";
import { adminHref, requirePage } from "@/lib/staff";
import { Stat } from "@/components/dashboard/charts";
import { ListTools, pageNum } from "@/components/dashboard/list-tools";
import { Pagination } from "@/components/shop/pagination";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requirePage("payments");
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 80) || undefined;
  const page = pageNum(sp.page);
  const res = await listPayments({ q, page });

  return (
    <div className="dash-page">
      <div className="dash-heading">
        <h1>Payments</h1>
      </div>
      <div className="dash-stats">
        <Stat label="Payments" value={res.total} />
        <Stat label="Collected" value={money(res.collected)} />
        <Stat label="Refunded" value={money(res.refunded)} />
      </div>
      <ListTools q={q} placeholder="Search order, payment id, email" />
      <div className="table-scroll">
        <table className="dash-table">
          <thead>
            <tr>
              <th>Paid</th>
              <th>Order</th>
              <th>Razorpay payment</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {res.rows.map((o) => (
              <tr key={o.id}>
                <td>
                  {o.paidAt?.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) ?? "—"}
                </td>
                <td>
                  <Link href={adminHref(`orders/${o.id}`)}>{o.id}</Link>
                </td>
                <td>
                  <code>{o.razorpayPaymentId}</code>
                  {o.refundId && <small className="block">Refund {o.refundId}</small>}
                </td>
                <td>{o.email}</td>
                <td>{money(o.total)}</td>
                <td>
                  <span className={"status-pill status-" + o.status}>{statusLabels[o.status]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!res.rows.length && <p className="dash-empty">No payments yet.</p>}
      </div>
      <Pagination page={page} pages={res.pages} basePath={adminHref("payments")} params={{ q }} />
    </div>
  );
}
