import Link from "next/link";
import { listRequests } from "@/lib/admin/team";
import { getCategories } from "@/lib/categories";
import { listRefundRequests } from "@/lib/refunds";
import { RefundRequestCard } from "@/components/dashboard/refund-request-card";
import { adminHref, requirePage } from "@/lib/staff";
import { ActionForm } from "@/components/dashboard/action-form";
import { pageNum } from "@/components/dashboard/list-tools";
import { Pagination } from "@/components/shop/pagination";
import { decideRequestAction } from "../actions";

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; page?: string }>;
}) {
  await requirePage("requests");
  const sp = await searchParams;
  const view = sp.view === "decided" ? "decided" : "pending";
  const page = pageNum(sp.page);
  const [res, refunds] = await Promise.all([
    listRequests(view, page),
    listRefundRequests({ status: view === "pending" ? "open" : "decided", page: 1 }),
  ]);
  const target = (type: string, id: string) =>
    type === "refund" || type === "delete_order"
      ? adminHref(`orders/${encodeURIComponent(id)}`)
      : type === "delete_category"
        ? adminHref("categories")
        : adminHref(`products/${encodeURIComponent(id)}`);
  const categoryNames = new Map((await getCategories(false)).map((c) => [c.id, c.name] as const));

  return (
    <div className="dash-page">
      <div className="dash-heading">
        <div>
          <h1>Requests</h1>
          <span className="muted">
            Customer refund requests, and refunds or deletions asked for by staff without that permission.
          </span>
        </div>
        <nav className="range-tabs">
          <Link href={adminHref("requests")} className={view === "pending" ? "active" : ""}>
            Waiting
          </Link>
          <Link href={adminHref("requests?view=decided")} className={view === "decided" ? "active" : ""}>
            Handled
          </Link>
        </nav>
      </div>
      <section className="dash-panel refund-panel">
        <h2>
          Customer refund requests{" "}
          <small className="muted">{view === "pending" ? `${refunds.total} open` : "recently decided"}</small>
        </h2>
        {refunds.rows.map(({ request, customer }) => (
          <RefundRequestCard
            key={request.id}
            r={request}
            isAdmin
            canVerify
            customer={customer}
            orderHref={adminHref(`orders/${encodeURIComponent(request.orderId)}`)}
          />
        ))}
        {!refunds.rows.length && (
          <p className="dash-empty">
            {view === "pending" ? "No customer refund requests waiting." : "None decided yet."}
          </p>
        )}
        {refunds.total > refunds.rows.length && (
          <Link className="text-link" href={adminHref("orders?status=refunds")}>
            See all in Orders
          </Link>
        )}
      </section>
      <h2 className="dash-subheading">Staff requests</h2>
      <div className="dash-grid">
        {res.rows.map((r) => (
          <section key={r.id} className="dash-panel">
            <h2>
              {r.type === "refund"
                ? "Refund order"
                : r.type === "delete_order"
                  ? "Delete order"
                  : r.type === "delete_category"
                    ? "Delete category"
                    : "Delete product"}{" "}
              <Link href={target(r.type, r.targetId)}>
                {r.type === "delete_category" ? (categoryNames.get(r.targetId) ?? r.targetId) : r.targetId}
              </Link>
            </h2>
            <p>
              “{r.reason}”
              <br />
              <small className="muted">
                {r.requestedBy} ·{" "}
                {r.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              </small>
            </p>
            {r.status === "pending" ? (
              <ActionForm action={decideRequestAction}>
                <input type="hidden" name="id" value={r.id} />
                <label>
                  Note (optional)
                  <input name="note" maxLength={500} />
                </label>
                <div className="button-row">
                  <button className="primary" name="decision" value="approve">
                    Approve & {r.type === "refund" ? "refund" : "delete"}
                  </button>
                  <button className="outline" name="decision" value="reject">
                    Reject
                  </button>
                </div>
              </ActionForm>
            ) : (
              <p className={"status-pill " + (r.status === "approved" ? "" : "out")}>
                {r.status} by {r.decidedBy}
                {r.decisionNote && ` — ${r.decisionNote}`}
              </p>
            )}
          </section>
        ))}
        {!res.rows.length && (
          <p className="dash-empty">
            {view === "pending" ? "Nothing waiting. 🎉" : "No handled requests yet."}
          </p>
        )}
      </div>
      <Pagination
        page={page}
        pages={res.pages}
        basePath={adminHref("requests")}
        params={{ view: view === "decided" ? view : undefined }}
      />
    </div>
  );
}
