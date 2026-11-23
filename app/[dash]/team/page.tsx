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
import { BulkBar, BulkCheck } from "@/components/dashboard/bulk-bar";
import { RowsEditor } from "@/components/dashboard/rows-editor";
import {
  addStaffRowsAction,
  bulkTeamAction,
  removeStaffAction,
  resetStaffPasswordAction,
  updateStaffAction,
} from "../actions";

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
        {editable && s.id !== me.id && (
          <BulkCheck form="team-bulk" value={s.id} label={`Select ${s.email}`} />
        )}{" "}
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
        <ActionForm action={updateStaffAction} saveAll>
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
      <section className="dash-panel highlight">
        <h2>Add people</h2>
        <p className="muted">
          One row per person — add one or several, then save. <b>Standard access</b> = Full access for admins,
          Default access for staff ({staffDefaultPermissions.map((k) => accessLabels[k]).join(", ")}). Pick
          “Choose access” to tick exactly what they can use.
          {!manager && " Only the store owner can add admins."}
        </p>
        <RowsEditor
          action={addStaffRowsAction}
          addLabel="Add another person"
          saveLabel="Save people"
          defaults={{
            email: "",
            role: "staff",
            access: "",
            permissions: "",
            active: true,
            notifyOrders: true,
          }}
          columns={[
            { key: "email", label: "Google email", type: "email", required: true, maxLength: 200 },
            {
              key: "role",
              label: "Role",
              type: "select",
              width: "140px",
              options: manager
                ? [
                    ["staff", "Shop staff"],
                    ["admin", "Shop admin"],
                  ]
                : [["staff", "Shop staff"]],
            },
            {
              key: "access",
              label: "Access",
              type: "select",
              width: "160px",
              empty: "Standard access",
              optionsBy: {
                key: "role",
                map: {
                  staff: [["manual", "Choose access"]],
                  admin: [["manual", "Choose access"]],
                },
              },
            },
            {
              key: "permissions",
              label: "Chosen access",
              type: "multi",
              empty: "—",
              hint: "only with “Choose access”",
              optionsBy: {
                key: "role",
                map: {
                  staff: permissionOptions.map((o) => [o.key, o.label] as [string, string]),
                  admin: [...permissionOptions, ...adminAreaOptions].map(
                    (o) => [o.key, o.label] as [string, string],
                  ),
                },
              },
            },
            { key: "active", label: "Dashboard", type: "check", width: "90px" },
            { key: "notifyOrders", label: "Order emails", type: "check", width: "100px" },
          ]}
        />
      </section>
      <BulkBar
        id="team-bulk"
        action={bulkTeamAction}
        noun="person"
        ops={[
          { op: "enable", label: "Allow dashboard" },
          { op: "disable", label: "Block dashboard" },
          { op: "notify_on", label: "Order emails on" },
          { op: "notify_off", label: "Order emails off" },
          { op: "remove", label: "Remove", danger: true, confirm: "Remove {n} people from the team?" },
        ]}
      />
      <div className="dash-grid">
        {" "}
        {team.map((s) => (
          <Member key={s.id} s={s} me={me} />
        ))}
      </div>
    </div>
  );
}
