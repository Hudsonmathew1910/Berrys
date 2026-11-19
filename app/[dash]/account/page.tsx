import { permissionLabels, requirePage } from "@/lib/staff";
import { ActionForm } from "@/components/dashboard/action-form";
import { changePasswordAction } from "../actions";

export default async function MyAccountPage() {
  const staff = await requirePage();
  return (
    <div className="dash-page">
      <div className="dash-heading">
        <h1>My dashboard password</h1>
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
            <b>{staff.email}</b> · {staff.role === "admin" ? "Shop admin — full access" : "Shop staff"}
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
      </div>
    </div>
  );
}
