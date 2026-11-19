import Link from "next/link";
import { listRequests } from "@/lib/admin/team";
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
  await requirePage("admin");
  const sp = await searchParams;
  const view = sp.view === "decided" ? "decided" : "pending";
  const page = pageNum(sp.page);
  const res = await listRequests(view, page);
  const target = (type: string, id: string) =>
    type === "refund"
      ? adminHref(`orders/${encodeURIComponent(id)}`)
      : adminHref(`products/${encodeURIComponent(id)}`);

  return (
    <div className="dash-page">
      <div className="dash-heading">
        <div>
          <h1>Staff requests</h1>
          <span className="muted">Refunds and deletions requested by staff without that permission.</span>
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
      <div className="dash-grid">
        {res.rows.map((r) => (
          <section key={r.id} className="dash-panel">
            <h2>
              {r.type === "refund" ? "Refund order" : "Delete product"}{" "}
              <Link href={target(r.type, r.targetId)}>{r.targetId}</Link>
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
