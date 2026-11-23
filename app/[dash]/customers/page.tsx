import Link from "next/link";
import { listCustomers } from "@/lib/admin/insights";
import { money } from "@/lib/catalog";
import { adminHref, can, requirePage } from "@/lib/staff";
import { BulkAll, BulkBar, BulkCheck } from "@/components/dashboard/bulk-bar";
import { bulkCustomersAction } from "../actions";
import { ListTools, pageNum } from "@/components/dashboard/list-tools";
import { Pagination } from "@/components/shop/pagination";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const staff = await requirePage("customers");
  const canDelete = can(staff, "delete_records");
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
      {canDelete && (
        <BulkBar
          id="customers-bulk"
          action={bulkCustomersAction}
          noun="customer"
          ops={[
            {
              op: "delete",
              label: "Delete accounts",
              danger: true,
              confirm: "Delete {n} customer accounts? Their orders are kept for your records.",
            },
          ]}
        />
      )}{" "}
      <div className="table-scroll">
        <table className="dash-table">
          <thead>
            <tr>
              {canDelete && (
                <th className="bulk-col">
                  <BulkAll form="customers-bulk" />
                </th>
              )}
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
                {canDelete && (
                  <td className="bulk-col">
                    <BulkCheck
                      form="customers-bulk"
                      value={user.id}
                      label={`Select ${user.email ?? user.name}`}
                    />
                  </td>
                )}
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
