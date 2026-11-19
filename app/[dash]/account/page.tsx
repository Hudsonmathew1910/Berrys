import { isOwnerEmail } from "@/lib/auth";
import { permissionLabels, requirePage, roleLabels } from "@/lib/staff";
import { ActionForm } from "@/components/dashboard/action-form";
import { changePasswordAction, myNotificationsAction } from "../actions";

export default async function MyAccountPage() {
  const staff = await requirePage();
  return (
    <div className="dash-page">
      <div className="dash-heading">
        <h1>My account</h1>
      </div>
      <div className="dash-grid">
        <section className="dash-panel">
          <h2>Change password</h2>
          <ActionForm action={changePasswordAction} resetOnSuccess>
            <label>
              Current password
              <input type="password" name="current" required autoComplete="current-password" />
            </label>
            <label>
              New password
              <input type="password" name="password" required minLength={10} autoComplete="new-password" />
            </label>
            <label>
              Confirm new password
              <input type="password" name="confirm" required minLength={10} autoComplete="new-password" />
            </label>
            <small className="muted">At least 10 characters, with a letter and a number.</small>
            <button className="primary">Change password</button>
          </ActionForm>
        </section>
        <section className="dash-panel">
          <h2>My access</h2>
          <p>
            <b>{staff.email}</b> · {staff.role === "admin" ? "Shop admin — full access" : roleLabels.staff}
          </p>
          {staff.role === "staff" && (
            <ul>
              {staff.permissions.map((p) => (
                <li key={p}>{permissionLabels[p]}</li>
              ))}
              {!staff.permissions.length && <li className="muted">No permissions yet — ask an admin.</li>}
            </ul>
          )}
        </section>
        <section className="dash-panel">
          <h2>My emails</h2>
          {isOwnerEmail(staff.email) ? (
            <p className="muted">
              This is the store owner address (STORE_OWNER_EMAIL), which never gets new-order emails. Turn
              them on for other team members on Team &amp; access.
            </p>
          ) : (
            <ActionForm action={myNotificationsAction}>
              <label className="check">
                <input type="checkbox" name="notifyOrders" defaultChecked={staff.notifyOrders} /> Email me
                every new order
              </label>
              <small className="muted">
                Sent to {staff.email} as soon as a customer’s payment is confirmed.
              </small>
              <button className="outline">Save</button>
            </ActionForm>
          )}
        </section>
      </div>
    </div>
  );
}
