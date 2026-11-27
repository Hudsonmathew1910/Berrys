import Link from "next/link";
import { listOrders } from "@/lib/admin/orders";
import { money } from "@/lib/catalog";
import { statusLabels } from "@/lib/order-status";
import { refundStatusLabels } from "@/lib/refunds";
import { adminHref, can, requirePage } from "@/lib/staff";
import { ListTools, pageNum } from "@/components/dashboard/list-tools";
import { ActionForm } from "@/components/dashboard/action-form";
import { Pagination } from "@/components/shop/pagination";
import { BulkAll, BulkBar, BulkCheck } from "@/components/dashboard/bulk-bar";
import { bulkOrderRefundsAction, bulkOrdersAction, deleteUnpaidOrdersAction } from "../actions";

type SP = { q?: string; status?: string; page?: string };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const staff = await requirePage("orders");
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 80) || undefined;
  const status =
    sp.status && (sp.status === "open" || sp.status === "refunds" || sp.status in statusLabels)
      ? sp.status
      : undefined;
  const page = pageNum(sp.page);
  const res = await listOrders({ q, status, page });
  const canDelete = can(staff, "delete_records");
  const approver = can(staff, "requests");
  // The refund-requests view acts on each order's refund request instead.
  const bulkId = status === "refunds" ? "order-refunds-bulk" : "orders-bulk";

  return (
    <div className="dash-page">
      <div className="dash-heading">
        <div>
          <h1>Orders</h1>
          <span className="muted">{res.total} orders</span>
        </div>
        {can(staff, "delete_records") && (
          <ActionForm
            action={deleteUnpaidOrdersAction}
            confirm="Delete ALL expired and cancelled (never paid) orders? This cannot be undone."
            inline
          >
            <button className="outline danger-outline">Delete expired & cancelled orders</button>
          </ActionForm>
        )}
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
              ["refunds", "Refund requests (open)"],
              ...Object.entries(statusLabels),
            ],
          },
        ]}
      />
      {status === "refunds" ? (
        <BulkBar
          id={bulkId}
          action={bulkOrderRefundsAction}
          noun="refund request"
          ops={
            approver
              ? [
                  {
                    op: "approve",
                    label: "Approve & send refunds",
                    confirm: "Approve {n} refunds and send the money? Each customer is emailed.",
                  },
                  {
                    op: "reject",
                    label: "Reject",
                    danger: true,
                    confirm: "Reject {n} refunds? Each customer is emailed your note.",
                  },
                ]
              : [
                  { op: "verify_approve", label: "Accept & send to admin" },
                  { op: "verify_reject", label: "Not valid — send to admin" },
                ]
          }
          fields={[
            {
              name: "note",
              label: approver ? "Note to the customers (needed to reject)" : "Note for the admin",
            },
          ]}
        />
      ) : (
        <BulkBar
          id={bulkId}
          action={bulkOrdersAction}
          noun="order"
          ops={[
            { op: "packed", label: "Mark packed" },
            { op: "shipped", label: "Mark shipped" },
            { op: "delivered", label: "Mark delivered" },
            {
              op: "delete",
              label: canDelete ? "Delete" : "Request deletion",
              danger: true,
              confirm: canDelete
                ? "Delete {n} orders permanently? This cannot be undone."
                : "Ask an admin to delete {n} orders?",
            },
          ]}
          fields={canDelete ? [] : [{ name: "reason", label: "Reason (for delete requests)" }]}
        />
      )}
      <div className="table-scroll">
        <table className="dash-table">
          <thead>
            <tr>
              <th className="bulk-col">
                <BulkAll form={bulkId} />
              </th>
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
                <td className="bulk-col">
                  <BulkCheck form={bulkId} value={o.id} label={`Select order ${o.id}`} />
                </td>
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
                  {o.isDemo && <span className="status-pill demo-pill">DEMO</span>}
                  {o.refundRequest && (
                    <span className={`status-pill refund-pill refund-${o.refundRequest}`}>
                      {refundStatusLabels[o.refundRequest]}
                    </span>
                  )}
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
