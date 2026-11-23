import { listStaff } from "@/lib/admin/team";
import {
  accessLabels,
  accessSummary,
  adminAreaKeys,
  adminAreaLabels,
  canManageAdmins,
  grantedAccess,
  hasFullAccess,
  isOwnerMember,
  permissionKeys,
  permissionLabels,
  requirePage,
  staffDefaultPermissions,
  type Staff,
} from "@/lib/staff";
import { AccessPicker } from "@/components/dashboard/access-picker";
import { ActionForm } from "@/components/dashboard/action-form";
import { addStaffAction, removeStaffAction, resetStaffPasswordAction, updateStaffAction } from "../actions";

const permissionOptions = permissionKeys.map((key) => ({ key, label: permissionLabels[key] }));
const adminAreaOptions = adminAreaKeys.map((key) => ({ key, label: adminAreaLabels[key] }));

function Picker({ s, allowAdmin }: { s?: Staff; allowAdmin: boolean }) {
  return (
    <AccessPicker
      role={s?.role ?? "staff"}
      mode={
        s
          ? s.role === "admin"
            ? s.accessMode === "manual"
              ? "manual"
              : "full"
            : s.accessMode === "manual"
              ? "manual"
              : "default"
          : "default"
      }
      selected={s?.accessMode === "manual" ? s.permissions : []}
      permissions={permissionOptions}
      adminAreas={adminAreaOptions}
      staffDefaults={staffDefaultPermissions}
      allowAdmin={allowAdmin}
    />
  );
}

/** Read-only view of what someone can do. */
function AccessList({ s }: { s: Staff }) {
  if (hasFullAccess(s)) return null;
  const list = grantedAccess(s);
  return (
    <ul className="access-list">
      {list.map((k) => (
        <li key={k}>{accessLabels[k]}</li>
      ))}
      {!list.length && <li className="muted">No access yet.</li>}
    </ul>
  );
}

function Member({ s, me }: { s: Staff; me: Staff }) {
  const owner = isOwnerMember(s);
  const manager = canManageAdmins(me);
  // Only the owner changes admins; admins can manage shop staff.
  const editable = !owner && (s.role !== "admin" || manager);
  return (
    <section className="dash-panel">
      <h2>
        {s.email} {owner && <em className="tag">Owner</em>} {s.id === me.id && <em className="tag">You</em>}
        {!s.active && <span className="status-pill out">Disabled</span>}
      </h2>
      <p className="muted">
        <b>{s.role === "admin" ? "Shop admin" : "Shop staff"}</b> · {accessSummary(s)} ·{" "}
        {s.passwordHash ? "Password set" : "Hasn’t created a password yet"} · Last active{" "}
        {s.lastSeenAt
          ? s.lastSeenAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
          : "never"}{" "}
        · added by {s.createdBy || "—"}
      </p>
      {editable ? (
        <ActionForm action={updateStaffAction}>
          <input type="hidden" name="id" value={s.id} />
          <div className="form-grid">
            <label>
              Name
              <input name="name" maxLength={80} defaultValue={s.name} />
            </label>
          </div>
          <Picker s={s} allowAdmin={manager} />
          <div className="form-grid">
            <label className="check wide">
              <input type="checkbox" name="active" defaultChecked={s.active} /> Can access the dashboard
            </label>
            <label className="check wide">
              <input type="checkbox" name="notifyOrders" defaultChecked={s.notifyOrders} /> Email this person
              every new order
            </label>
          </div>
          <button className="outline">Save</button>
        </ActionForm>
      ) : (
        <>
          <p className="muted">
            {owner
              ? "The store owner (STORE_OWNER_EMAIL) always has full access and never gets new-order emails."
              : "Only the store owner can change an admin’s access."}
          </p>
          <AccessList s={s} />
        </>
      )}
      <div className="row-actions-wide">
        {s.passwordHash && (s.id === me.id || editable) && (
          <ActionForm
            action={resetStaffPasswordAction}
            confirm={`Reset ${s.email}’s password? They’ll create a new one next time.`}
            inline
          >
            <input type="hidden" name="id" value={s.id} />
            <button className="text-link">Reset password</button>
          </ActionForm>
        )}
        {editable && s.id !== me.id && (
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
  const me = await requirePage("team");
  const team = await listStaff();
  const manager = canManageAdmins(me);
  return (
    <div className="dash-page">
      <div className="dash-heading">
        <div>
          <h1>Team & access</h1>
          <span className="muted">
            Add people by their Google email. When they log in with that Google account and open the dashboard
            address, they create their own dashboard password.
            {!manager && " Only the store owner can add or change admins."}
          </span>
        </div>
      </div>
      <div className="dash-grid">
        <section className="dash-panel highlight">
          <h2>Add {manager ? "an admin or staff member" : "a staff member"}</h2>
          <ActionForm action={addStaffAction} resetOnSuccess>
            <div className="form-grid">
              <label>
                Google email
                <input name="email" type="email" required placeholder="name@gmail.com" />
              </label>
            </div>
            <Picker allowAdmin={manager} />
            <div className="form-grid">
              <label className="check wide">
                <input type="checkbox" name="active" defaultChecked /> Can access the dashboard
              </label>
              <label className="check wide">
                <input type="checkbox" name="notifyOrders" defaultChecked /> Email this person every new order
              </label>
            </div>
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
