import Link from "next/link";
import { listOrders } from "@/lib/admin/orders";
import { money } from "@/lib/catalog";
import { statusLabels } from "@/lib/order-status";
import { adminHref, requirePage } from "@/lib/staff";
import { ListTools, pageNum } from "@/components/dashboard/list-tools";
import { Pagination } from "@/components/shop/pagination";

type SP = { q?: string; status?: string; page?: string };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePage("orders");
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 80) || undefined;
  const status = sp.status && (sp.status === "open" || sp.status in statusLabels) ? sp.status : undefined;
  const page = pageNum(sp.page);
  const res = await listOrders({ q, status, page });

  return (
    <div className="dash-page">
      <div className="dash-heading">
        <h1>Orders</h1>
        <span className="muted">{res.total} orders</span>
      </div>
      <ListTools
        q={q}
        placeholder="Search order no, name, email, phone"
        selects={[
          {
            name: "status",
            label: "Status",
            value: status,
            options: [
              ["", "All orders"],
              ["open", "To fulfil (paid / packed / shipped)"],
              ...Object.entries(statusLabels),
            ],
          },
        ]}
      />
      <div className="table-scroll">
        <table className="dash-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Date</th>
              <th>Total</th>
              <th>Status</th>
              <th>Tracking</th>
            </tr>
          </thead>
          <tbody>
            {res.rows.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link href={adminHref(`orders/${o.id}`)}>
                    <b>{o.id}</b>
                  </Link>
                </td>
                <td>
                  {o.customer}
                  <small className="block">{o.email}</small>
                </td>
                <td>{o.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                <td>{money(o.total)}</td>
                <td>
                  <span className={"status-pill status-" + o.status}>{statusLabels[o.status]}</span>
                </td>
                <td>{o.trackingNumber ? `${o.courier} ${o.trackingNumber}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!res.rows.length && <p className="dash-empty">No orders match.</p>}
      </div>
      <Pagination page={page} pages={res.pages} basePath={adminHref("orders")} params={{ q, status }} />
    </div>
  );
}
