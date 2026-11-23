"use client";
import { useEffect, useRef, useState } from "react";

type Role = "admin" | "staff";
type Mode = "full" | "default" | "manual";
type Option = { key: string; label: string };

type Props = {
  role: Role;
  mode: Mode;
  selected: string[];
  permissions: Option[];
  adminAreas: Option[];
  staffDefaults: string[];
  /** Only the store owner can make someone an admin. */
  allowAdmin: boolean;
};

/**
 * Role + access for Team & access. When its form is reset (after "Add to
 * team" succeeds) it starts again from the defaults.
 */
export function AccessPicker(props: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    // After the browser's own reset, rebuild the picker from its starting values.
    const onReset = () => setTimeout(() => setRound((n) => n + 1), 0);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);
  return (
    <div ref={ref} className="access-picker-wrap">
      <Picker key={round} {...props} />
    </div>
  );
}

/**
 * Role + access for Team & access.
 * Admin: "Full access" (everything, like the owner) or "Choose access".
 * Staff: "Default access" (the standard set) or "Choose access".
 */
function Picker({
  role: initialRole,
  mode: initialMode,
  selected,
  permissions,
  adminAreas,
  staffDefaults,
  allowAdmin,
}: Props) {
  const [role, setRole] = useState<Role>(initialRole);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(selected));
  const manual = mode === "manual";

  function changeRole(next: Role) {
    setRole(next);
    setMode(next === "admin" ? "full" : "default");
  }

  function choose(next: Mode) {
    // Switching to "Choose access": start from what they'd have had.
    if (next === "manual" && mode !== "manual" && ticked.size === 0)
      setTicked(
        new Set(role === "admin" ? [...permissions, ...adminAreas].map((o) => o.key) : staffDefaults),
      );
    setMode(next);
  }

  const toggle = (key: string, on: boolean) =>
    setTicked((t) => {
      const n = new Set(t);
      if (on) n.add(key);
      else n.delete(key);
      return n;
    });

  const box = (o: Option, disabled = false, checked = ticked.has(o.key)) => (
    <label key={o.key} className={"check" + (disabled ? " muted" : "")}>
      <input
        type="checkbox"
        name={disabled ? undefined : "permissions"}
        value={o.key}
        checked={checked}
        disabled={disabled}
        onChange={(e) => toggle(o.key, e.target.checked)}
      />
      {o.label}
    </label>
  );

  return (
    <div className="access-picker">
      <label>
        Role
        <select name="role" value={role} onChange={(e) => changeRole(e.target.value as Role)}>
          <option value="staff">Shop staff</option>
          {(allowAdmin || role === "admin") && <option value="admin">Shop admin</option>}
        </select>
      </label>

      <div className="access-modes" role="radiogroup" aria-label="Access">
        <label className={"access-mode" + (!manual ? " on" : "")}>
          <input
            type="radio"
            name="accessMode"
            value={role === "admin" ? "full" : "default"}
            checked={!manual}
            onChange={() => choose(role === "admin" ? "full" : "default")}
          />
          <span>
            <b>{role === "admin" ? "Full access" : "Default access"}</b>
            <small>
              {role === "admin"
                ? "Everything, like the store owner."
                : "Orders, products, categories, offers, stock, payments, customers, sales, refunds and deleting products."}
            </small>
          </span>
        </label>
        <label className={"access-mode" + (manual ? " on" : "")}>
          <input
            type="radio"
            name="accessMode"
            value="manual"
            checked={manual}
            onChange={() => choose("manual")}
          />
          <span>
            <b>Choose access</b>
            <small>Tick exactly what this person can do.</small>
          </span>
        </label>
      </div>

      {role === "staff" && !manual ? (
        <fieldset className="perm-grid">
          <legend>Included in default access</legend>
          {permissions.filter((o) => staffDefaults.includes(o.key)).map((o) => box(o, true, true))}
        </fieldset>
      ) : manual ? (
        <>
          <fieldset className="perm-grid">
            <legend>Shop</legend>
            {permissions.map((o) => box(o))}
          </fieldset>
          {role === "admin" && (
            <fieldset className="perm-grid">
              <legend>Admin areas</legend>
              {adminAreas.map((o) => box(o))}
            </fieldset>
          )}
        </>
      ) : null}
    </div>
  );
}
