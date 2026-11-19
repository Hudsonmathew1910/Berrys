import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { customerDetail } from "@/lib/admin/insights";
import { money } from "@/lib/catalog";
import { salesStatuses, statusLabels } from "@/lib/order-status";
import { adminHref, can, requirePage } from "@/lib/staff";
import { ActionForm } from "@/components/dashboard/action-form";
import { Stat } from "@/components/dashboard/charts";
import { deleteCustomerAction } from "../../actions";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePage("customers");
  const id = (await params).id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await customerDetail(id);
  if (!c) notFound();
  const paid = c.orders.filter((o) => salesStatuses.includes(o.status));
  const seeOrders = can(staff, "orders");

  return (
    <div className="dash-page">
      <Link className="text-link" href={adminHref("customers")}>
        <ArrowLeft size={15} /> All customers
      </Link>
      <div className="dash-heading">
        <div>
          <h1>{c.user.name || c.user.email || c.user.phone}</h1>
          <span className="muted">
            {c.user.email ?? "No Google account"} · {c.user.phone ?? "No mobile"} · joined{" "}
            {c.user.createdAt.toLocaleDateString("en-IN")}
          </span>
        </div>
      </div>
      <div className="dash-stats">
        <Stat label="Orders" value={c.orders.filter((o) => o.status !== "pending_payment").length} />
        <Stat label="Spent" value={money(paid.reduce((a, o) => a + o.total, 0))} />
        <Stat label="Last login" value={c.user.lastLoginAt.toLocaleDateString("en-IN")} />
      </div>
      <div className="dash-grid">
        <section className="dash-panel wide">
          <h2>Orders</h2>
          <table className="dash-table compact">
            <tbody>
              {c.orders.map((o) => (
                <tr key={o.id}>
                  <td>{seeOrders ? <Link href={adminHref(`orders/${o.id}`)}>{o.id}</Link> : o.id}</td>
                  <td>{o.createdAt.toLocaleDateString("en-IN")}</td>
                  <td>{money(o.total)}</td>
                  <td>
                    <span className={"status-pill status-" + o.status}>{statusLabels[o.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!c.orders.length && <p className="muted">No orders yet.</p>}
        </section>
        {staff.role === "admin" && (
          <section className="dash-panel danger-zone">
            <h2>Delete customer</h2>
            <p className="muted">
              Deletes their account, saved addresses and logins (they’re signed out). Their orders stay in
              Orders and sales, without the account link. They can sign up again with Google later.
            </p>
            <ActionForm
              action={deleteCustomerAction}
              confirm={`Delete ${c.user.email ?? "this customer"}’s account permanently?`}
            >
              <input type="hidden" name="userId" value={c.user.id} />
              <button className="primary danger">Delete customer</button>
            </ActionForm>
          </section>
        )}
        <section className="dash-panel">
          <h2>Saved addresses</h2>
          {c.addresses.map((a) => (
            <p key={a.id}>
              <b>{a.name}</b> {a.isDefault && <em className="tag">Default</em>}
              <br />
              {[a.line1, a.line2, a.city, a.state].filter(Boolean).join(", ")} — {a.pincode}
              <br />
              +91 {a.phone}
            </p>
          ))}
          {!c.addresses.length && <p className="muted">No saved addresses.</p>}
        </section>
      </div>
    </div>
  );
}
