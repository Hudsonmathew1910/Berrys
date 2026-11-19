import Link from "next/link";
import { listCustomers } from "@/lib/admin/insights";
import { money } from "@/lib/catalog";
import { adminHref, requirePage } from "@/lib/staff";
import { ListTools, pageNum } from "@/components/dashboard/list-tools";
import { Pagination } from "@/components/shop/pagination";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requirePage("customers");
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 80) || undefined;
  const page = pageNum(sp.page);
  const res = await listCustomers({ q, page });

  return (
    <div className="dash-page">
      <div className="dash-heading">
        <h1>Customers</h1>
        <span className="muted">{res.total} accounts</span>
      </div>
      <ListTools q={q} placeholder="Search name, email, mobile" />
      <div className="table-scroll">
        <table className="dash-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Mobile</th>
              <th>Joined</th>
              <th>Orders</th>
              <th>Spent</th>
            </tr>
          </thead>
          <tbody>
            {res.rows.map(({ user, spent, orders }) => (
              <tr key={user.id}>
                <td>
                  <Link href={adminHref(`customers/${user.id}`)}>
                    <b>{user.name || "—"}</b>
                  </Link>
                  <small className="block">{user.email ?? "—"}</small>
                </td>
                <td>{user.phone ?? "—"}</td>
                <td>{user.createdAt.toLocaleDateString("en-IN")}</td>
                <td>{orders}</td>
                <td>{money(spent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!res.rows.length && <p className="dash-empty">No customers match.</p>}
      </div>
      <Pagination page={page} pages={res.pages} basePath={adminHref("customers")} params={{ q }} />
    </div>
  );
}
