import { listStaff } from "@/lib/admin/team";
import { isOwnerEmail } from "@/lib/auth";
import { permissionKeys, permissionLabels, requirePage, type Staff } from "@/lib/staff";
import { ActionForm } from "@/components/dashboard/action-form";
import { addStaffAction, removeStaffAction, resetStaffPasswordAction, updateStaffAction } from "../actions";

function Permissions({ selected }: { selected: string[] }) {
  return (
    <fieldset className="perm-grid">
      <legend>Staff permissions (admins have everything)</legend>
      {permissionKeys.map((p) => (
        <label key={p} className="check">
          <input type="checkbox" name="permissions" value={p} defaultChecked={selected.includes(p)} />
          {permissionLabels[p]}
        </label>
      ))}
    </fieldset>
  );
}

function Member({ s, me }: { s: Staff; me: Staff }) {
  const owner = isOwnerEmail(s.email);
  return (
    <section className="dash-panel">
      <h2>
        {s.email} {owner && <em className="tag">Owner</em>} {s.id === me.id && <em className="tag">You</em>}
        {!s.active && <span className="status-pill out">Disabled</span>}
      </h2>
      <p className="muted">
        {s.passwordHash ? "Password set" : "Hasn’t created a password yet"} · Last active{" "}
        {s.lastSeenAt
          ? s.lastSeenAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
          : "never"}{" "}
        · added by {s.createdBy || "—"}
      </p>
      <ActionForm action={updateStaffAction}>
        <input type="hidden" name="id" value={s.id} />
        <div className="form-grid">
          <label>
            Name
            <input name="name" maxLength={80} defaultValue={s.name} />
          </label>
          <label>
            Role
            <select name="role" defaultValue={s.role} disabled={owner}>
              <option value="admin">Shop admin (full access)</option>
              <option value="staff">Shop staff (chosen permissions)</option>
            </select>
            {owner && <input type="hidden" name="role" value="admin" />}
          </label>
          <label className="check wide">
            <input type="checkbox" name="active" defaultChecked={s.active} disabled={owner} /> Can access the
            dashboard
            {owner && <input type="hidden" name="active" value="on" />}
          </label>
        </div>
        {!owner && <Permissions selected={s.permissions} />}
        <button className="outline">Save</button>
      </ActionForm>
      <div className="row-actions-wide">
        {s.passwordHash && (
          <ActionForm
            action={resetStaffPasswordAction}
            confirm={`Reset ${s.email}’s password? They’ll create a new one next time.`}
            inline
          >
            <input type="hidden" name="id" value={s.id} />
            <button className="text-link">Reset password</button>
          </ActionForm>
        )}
        {!owner && s.id !== me.id && (
          <ActionForm action={removeStaffAction} confirm={`Remove ${s.email} from the team?`} inline>
            <input type="hidden" name="id" value={s.id} />
            <button className="text-link danger">Remove</button>
          </ActionForm>
        )}
      </div>
    </section>
  );
}

export default async function TeamPage() {
  const me = await requirePage("admin");
  const team = await listStaff();
  return (
    <div className="dash-page">
      <div className="dash-heading">
        <div>
          <h1>Team & access</h1>
          <span className="muted">
            Add people by their Google email. When they log in with that Google account and open the dashboard
            address, they create their own dashboard password.
          </span>
        </div>
      </div>
      <div className="dash-grid">
        <section className="dash-panel highlight">
          <h2>Add an admin or staff member</h2>
          <ActionForm action={addStaffAction} resetOnSuccess>
            <div className="form-grid">
              <label>
                Google email
                <input name="email" type="email" required placeholder="name@gmail.com" />
              </label>
              <label>
                Role
                <select name="role" defaultValue="staff">
                  <option value="staff">Shop staff</option>
                  <option value="admin">Shop admin</option>
                </select>
              </label>
              <label className="wide muted">
                Mobile-number team accounts will be available when mobile login is switched on.
              </label>
            </div>
            <Permissions selected={["orders", "products", "stock"]} />
            <button className="primary">Add to team</button>
          </ActionForm>
        </section>
        {team.map((s) => (
          <Member key={s.id} s={s} me={me} />
        ))}
      </div>
    </div>
  );
}
