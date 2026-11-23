"use client";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import { api } from "@/components/store/api";
import { FORM_DONE } from "./action-form";
import type { ActionResult } from "@/app/[dash]/actions";

type Value = string | boolean;
export type Row = Record<string, Value>;
type Option = [value: string, label: string];

export type Column = { key: string; label: string; width?: string; required?: boolean; hint?: string } & (
  | { type: "text" | "email" | "datetime-local"; placeholder?: string; maxLength?: number }
  | { type: "number"; min?: number; max?: number; placeholder?: string }
  /** `optionsBy`: the choices depend on another column's value (e.g. sizes of the chosen product). */
  | { type: "select"; options?: Option[]; optionsBy?: OptionsBy; empty?: string }
  /** Several choices (saved as lines). */
  | { type: "multi"; options?: Option[]; optionsBy?: OptionsBy; empty?: string }
  /** A number for each choice, e.g. stock for each size of the chosen category (saved as "S=3" lines). */
  | { type: "counts"; optionsBy: OptionsBy }
  | { type: "check" }
  /** `max` > 1: several photos (saved as lines). */
  | { type: "image"; max?: number }
);
type OptionsBy = { key: string; map: Record<string, Option[]> };
type Action = (prev: ActionResult, data: FormData) => Promise<ActionResult>;
type Keyed = { _id: number; values: Row };

let nextId = 1;
const lines = (v: Value | undefined) =>
  String(v ?? "")
    .split("\n")
    .filter(Boolean);
const blank = (defaults: Row): Keyed => ({ _id: nextId++, values: { ...defaults } });

/**
 * "Add several at once": a table of new rows that are all saved with one "Save all" click.
 * The server action gets `rows` (JSON array) and may answer `rowErrors` (row index → message);
 * saved rows are removed, rows with a problem stay with their message.
 */
export function RowsEditor({
  action,
  columns,
  defaults,
  addLabel = "Add row",
  saveLabel = "Save all",
  hidden = {},
  layout = "table",
  itemLabel = "Row",
}: {
  action: Action;
  columns: Column[];
  defaults: Row;
  addLabel?: string;
  saveLabel?: string;
  hidden?: Record<string, string>;
  /** "cards": each row is a card with wrapping fields — for many columns. */
  layout?: "table" | "cards";
  /** Card title, e.g. "Offer" → "Offer 1". */
  itemLabel?: string;
}) {
  const [rows, setRows] = useState<Keyed[]>(() => [blank(defaults)]);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [uploading, setUploading] = useState(-1);
  const [state, formAction, pending] = useActionState(action, {});
  const sent = useRef<Keyed[]>([]);
  const ref = useRef<HTMLFormElement>(null);

  // Rows the person actually filled in (an untouched starter row is ignored).
  const filled = rows.filter((r) =>
    columns.some(
      (c) => c.type !== "check" && String(r.values[c.key] ?? "") !== String(defaults[c.key] ?? ""),
    ),
  );

  useEffect(() => {
    if (!state.at) return;
    const failed = state.rowErrors ?? {};
    const keep = sent.current.filter((_, i) => failed[i]);
    const msgs: Record<number, string> = {};
    sent.current.forEach((r, i) => failed[i] && (msgs[r._id] = failed[i]));
    if (!state.error || keep.length) {
      const savedIds = new Set(sent.current.filter((_, i) => !failed[i]).map((r) => r._id));
      setRows((all) => {
        const left = all.filter((r) => !savedIds.has(r._id));
        return left.length ? left : [blank(defaults)];
      });
    }
    setErrors(msgs);
    ref.current?.dispatchEvent(
      new CustomEvent(FORM_DONE, {
        detail: keep.length ? { ...state, error: state.error || "Some rows failed." } : state,
        bubbles: true,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // A select whose choices depend on this column is cleared when it changes.
  const dependents = (key: string) =>
    columns.filter((d) => "optionsBy" in d && d.optionsBy?.key === key).map((d) => [d.key, ""]);
  const set = (id: number, key: string, value: Value) =>
    setRows((all) =>
      all.map((r) =>
        r._id === id
          ? { ...r, values: { ...r.values, ...Object.fromEntries(dependents(key)), [key]: value } }
          : r,
      ),
    );

  async function upload(id: number, key: string, files: File[]) {
    if (!files.length) return;
    setUploading(id);
    try {
      for (const file of files) {
        const body = new FormData();
        body.set("file", file);
        const url = (await api<{ url: string }>("/api/admin/upload", { method: "POST", body })).url;
        setRows((all) =>
          all.map((r) => {
            if (r._id !== id) return r;
            const col = columns.find((c) => c.key === key);
            const max = col?.type === "image" ? (col.max ?? 1) : 1;
            const list = max > 1 ? lines(r.values[key]) : [];
            return { ...r, values: { ...r.values, [key]: [...list, url].slice(-max).join("\n") } };
          }),
        );
      }
      setErrors((e) => ({ ...e, [id]: "" }));
    } catch (e) {
      setErrors((x) => ({ ...x, [id]: (e as Error).message }));
    } finally {
      setUploading(-1);
    }
  }

  function cell(r: Keyed, c: Column) {
    const v = r.values[c.key];
    const label = `${c.label} (row ${rows.indexOf(r) + 1})`;
    const choices = (x: { options?: Option[]; optionsBy?: OptionsBy }) =>
      x.optionsBy ? (x.optionsBy.map[String(r.values[x.optionsBy.key] ?? "")] ?? []) : (x.options ?? []);
    switch (c.type) {
      case "check":
        return (
          <input
            type="checkbox"
            aria-label={label}
            checked={!!v}
            onChange={(e) => set(r._id, c.key, e.target.checked)}
          />
        );
      case "select":
        return (
          <select
            aria-label={label}
            value={String(v ?? "")}
            onChange={(e) => set(r._id, c.key, e.target.value)}
          >
            <option value="">{c.empty ?? "Choose…"}</option>
            {choices(c).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        );
      case "multi": {
        const opts = choices(c);
        const picked = new Set(lines(v));
        const names = opts.filter(([o]) => picked.has(o)).map(([, t]) => t);
        return (
          <details className="rows-multi">
            <summary aria-label={label}>
              {names.length
                ? names.length > 2
                  ? `${names.length} chosen`
                  : names.join(", ")
                : (c.empty ?? "Choose…")}
            </summary>
            <div className="rows-multi-list">
              {opts.map(([o, text]) => (
                <label key={o} className="check">
                  <input
                    type="checkbox"
                    checked={picked.has(o)}
                    onChange={(e) => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(o);
                      else next.delete(o);
                      set(r._id, c.key, [...next].join("\n"));
                    }}
                  />{" "}
                  {text}
                </label>
              ))}
              {!opts.length && <small className="muted">Nothing to choose for this row.</small>}
            </div>
          </details>
        );
      }
      case "counts": {
        const opts = choices(c);
        const counts = Object.fromEntries(lines(v).map((l) => l.split("=") as [string, string]));
        if (!opts.length) return <small className="muted">Choose a category first</small>;
        return (
          <span className="rows-counts">
            {opts.map(([o, text]) => (
              <label key={o}>
                <small>{text}</small>
                <input
                  type="number"
                  min={0}
                  max={100000}
                  aria-label={`${text} — ${label}`}
                  value={counts[o] ?? ""}
                  placeholder="0"
                  onChange={(e) =>
                    set(
                      r._id,
                      c.key,
                      Object.entries({ ...counts, [o]: e.target.value })
                        .filter(([, n]) => n !== "")
                        .map(([k, n]) => `${k}=${n}`)
                        .join("\n"),
                    )
                  }
                />
              </label>
            ))}
          </span>
        );
      }
      case "image": {
        const max = c.max ?? 1;
        const list = lines(v);
        return (
          <span className="rows-images">
            {list.map((src, i) => (
              <button
                key={src + i}
                type="button"
                className="rows-image"
                title="Remove photo"
                aria-label={`Remove photo ${i + 1} — ${label}`}
                onClick={() => set(r._id, c.key, list.filter((_, j) => j !== i).join("\n"))}
              >
                <img src={src} alt="" />
              </button>
            ))}
            {list.length < max && (
              <label className="rows-image add" title={max > 1 ? "Add photos" : "Upload photo"}>
                {uploading === r._id ? <Loader2 className="spin" size={16} /> : <Upload size={16} />}
                <input
                  type="file"
                  hidden
                  multiple={max > 1}
                  accept="image/jpeg,image/png,image/webp"
                  aria-label={label}
                  onChange={(e) => {
                    upload(r._id, c.key, [...(e.target.files ?? [])].slice(0, max - list.length));
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </span>
        );
      }
      default:
        return (
          <input
            aria-label={label}
            type={c.type}
            value={String(v ?? "")}
            placeholder={"placeholder" in c ? c.placeholder : undefined}
            maxLength={"maxLength" in c ? c.maxLength : undefined}
            min={"min" in c ? c.min : undefined}
            max={"max" in c ? c.max : undefined}
            onChange={(e) => set(r._id, c.key, e.target.value)}
          />
        );
    }
  }
  /** Copy / remove buttons for one row. */
  const tools = (r: Keyed, i: number) => (
    <span className="rows-tool-buttons">
      <button
        type="button"
        className="icon-button"
        aria-label={`Copy row ${i + 1}`}
        title="Copy"
        onClick={() =>
          setRows((all) => {
            const at = all.findIndex((x) => x._id === r._id);
            const copy = { _id: nextId++, values: { ...r.values } };
            return [...all.slice(0, at + 1), copy, ...all.slice(at + 1)];
          })
        }
      >
        <Copy size={14} />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={`Remove row ${i + 1}`}
        title="Remove"
        onClick={() =>
          setRows((all) => {
            const left = all.filter((x) => x._id !== r._id);
            return left.length ? left : [blank(defaults)];
          })
        }
      >
        <Trash2 size={14} />
      </button>
    </span>
  );

  return (
    <form
      ref={ref}
      className="rows-editor"
      data-save-all=""
      action={formAction}
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        sent.current = filled;
        if (!filled.length) {
          setErrors({});
          ref.current?.dispatchEvent(
            new CustomEvent(FORM_DONE, { detail: { ok: "Nothing to save.", at: Date.now() }, bubbles: true }),
          );
          return;
        }
        // Sent by hand: React's automatic form submit would clear the rows that failed.
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      onReset={() => {
        setRows([blank(defaults)]);
        setErrors({});
      }}
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="rows" value={JSON.stringify(filled.map((r) => r.values))} />
      {layout === "cards" ? (
        // Each row as a card whose fields wrap to the screen width (no sideways scrolling).
        <div className="rows-cards">
          {rows.map((r, i) => (
            <div key={r._id} className={"rows-card" + (errors[r._id] ? " row-error" : "")}>
              <div className="rows-card-head">
                <b>
                  {itemLabel} {i + 1}
                </b>
                {tools(r, i)}
              </div>
              <div className="rows-card-grid">
                {columns.map((c) => (
                  <div key={c.key} className={`rows-field rows-field-${c.type}`}>
                    <span className="rows-field-label">
                      {c.label}
                      {c.required && <span aria-hidden="true"> *</span>}
                      {c.hint && <small className="muted"> · {c.hint}</small>}
                    </span>
                    {cell(r, c)}
                  </div>
                ))}
              </div>
              {errors[r._id] && <small className="row-msg">{errors[r._id]}</small>}
            </div>
          ))}
        </div>
      ) : (
        <div className="table-scroll">
          <table className="dash-table compact rows-table">
            <thead>
              <tr>
                <th aria-label="Row">#</th>
                {columns.map((c) => (
                  <th key={c.key} style={c.width ? { width: c.width } : undefined}>
                    {c.label}
                    {c.required && <span aria-hidden="true"> *</span>}
                    {c.hint && <small className="block muted rows-hint">{c.hint}</small>}
                  </th>
                ))}
                <th aria-label="Row tools" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r._id} className={errors[r._id] ? "row-error" : undefined}>
                  <td className="muted">{i + 1}</td>
                  {columns.map((c) => (
                    <td key={c.key}>{cell(r, c)}</td>
                  ))}
                  <td className="rows-tools">
                    {tools(r, i)}
                    {errors[r._id] && <small className="row-msg">{errors[r._id]}</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="rows-actions">
        <button type="button" className="outline" onClick={() => setRows((all) => [...all, blank(defaults)])}>
          <Plus size={15} /> {addLabel}
        </button>
        <button className="primary" disabled={pending || uploading >= 0}>
          {pending ? <Loader2 className="spin" size={15} /> : <Save size={15} />} {saveLabel}
          {filled.length > 0 && ` (${filled.length})`}
        </button>
        {(state.ok || state.error) && (
          <p key={state.at} className={state.error ? "form-msg error" : "form-msg ok"} role="status">
            {state.error ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />} {state.error ?? state.ok}
          </p>
        )}
      </div>
    </form>
  );
}
