import Link from "next/link";
import { money } from "@/lib/catalog";
import { refundStatusLabels, type RefundRequest } from "@/lib/refunds";
import { ActionForm } from "@/components/dashboard/action-form";
import { BulkCheck } from "@/components/dashboard/bulk-bar";
import { decideRefundRequestAction, verifyRefundRequestAction } from "@/app/[dash]/actions";

const fmt = (d: Date | null) =>
  d ? d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "";

/**
 * One customer refund request with the next step for this person:
 * staff verify it (with a recommendation), admins approve or reject.
 */
export function RefundRequestCard({
  r,
  isAdmin,
  canVerify,
  orderHref,
  customer,
  bulkForm,
}: {
  r: RefundRequest;
  isAdmin: boolean;
  canVerify: boolean;
  /** Shown on the Requests page (links to the order). */
  orderHref?: string;
  customer?: string;
  /** Adds a tick box (while open) for the page's bulk bar with this id. */
  bulkForm?: string;
}) {
  const open = r.status === "requested" || r.status === "verified";
  return (
    <div className={`refund-card refund-${r.status}`}>
      <div className="refund-card-head">
        {open && bulkForm && (
          <BulkCheck form={bulkForm} value={r.id} label={`Select refund request for ${r.orderId}`} />
        )}
        <span className={`status-pill refund-pill refund-${r.status}`}>{refundStatusLabels[r.status]}</span>
        {orderHref && (
          <Link href={orderHref}>
            <b>{r.orderId}</b>
          </Link>
        )}
        {customer && <span className="muted">{customer}</span>}
        <small className="muted">{fmt(r.createdAt)}</small>
      </div>
      <ul className="refund-lines">
        {r.items.map((i) => (
          <li key={i.orderItemId}>
            <span>
              {i.name} · Size {i.size} × {i.quantity}
            </span>
            <span>{money(i.price * i.quantity)}</span>
          </li>
        ))}
        <li className="total">
          <span>Refund {r.wholeOrder ? "(whole order incl. shipping)" : ""}</span>
          <b>{money(r.amount)}</b>
        </li>
      </ul>
      <p className="refund-reason">
        <b>{r.reason}</b>
        {r.details && <span>“{r.details}”</span>}
      </p>
      {r.verifiedBy && (
        <p className="muted">
          Verified by {r.verifiedBy} · {fmt(r.verifiedAt)}
          {r.staffNote && <> — {r.staffNote}</>}
        </p>
      )}
      {r.decidedBy && (
        <p className="muted">
          {r.status === "approved" ? "Approved" : "Rejected"} by {r.decidedBy} · {fmt(r.decidedAt)}
          {r.decisionNote && <> — {r.decisionNote}</>}
        </p>
      )}

      {open && isAdmin && (
        <ActionForm action={decideRefundRequestAction}>
          <input type="hidden" name="id" value={r.id} />
          <label>
            Note to the customer <small className="muted">(needed when rejecting)</small>
            <input name="note" maxLength={500} />
          </label>
          <div className="button-row">
            <button className="primary" name="decision" value="approve">
              Approve refund
            </button>
            <button className="outline danger-outline" name="decision" value="reject">
              Reject
            </button>
          </div>
        </ActionForm>
      )}
      {r.status === "requested" && !isAdmin && canVerify && (
        <ActionForm action={verifyRefundRequestAction}>
          <input type="hidden" name="id" value={r.id} />
          <label>
            Your recommendation
            <select name="recommend" defaultValue="approve">
              <option value="approve">Reason checked — approve the refund</option>
              <option value="reject">Reason not valid — reject</option>
            </select>
          </label>
          <label>
            Note for the admin
            <input name="note" maxLength={500} placeholder="e.g. Photo shows a torn seam" />
          </label>
          <button className="primary">Verify & send to admin</button>
        </ActionForm>
      )}
      {r.status === "verified" && !isAdmin && (
        <p className="muted">Waiting for an admin to approve or reject.</p>
      )}
      {r.status === "approved" && (
        <p className="refund-next">
          Next: send {money(r.amount)} back to the customer. Online refunds will work here once Razorpay is
          connected.
        </p>
      )}
    </div>
  );
}
