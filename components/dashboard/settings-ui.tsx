/** On/off switch row for settings forms (a styled checkbox, works without JavaScript). */
export function Toggle({
  name,
  title,
  text,
  checked,
  disabled,
}: {
  name: string;
  title: string;
  text?: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
}) {
  return (
    <label className={"setting-toggle" + (disabled ? " disabled" : "")}>
      <span className="setting-text">
        <b>{title}</b>
        {text && <small>{text}</small>}
      </span>
      <input type="checkbox" role="switch" name={name} defaultChecked={checked} disabled={disabled} />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}

export function StatusDot({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={"status-dot " + (ok ? "ok" : "off")}>
      <span />
      {children}
    </span>
  );
}
