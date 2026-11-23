"use client";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { ActionResult } from "@/app/[dash]/actions";

type Action = (prev: ActionResult, data: FormData) => Promise<ActionResult>;

export type BulkOp = {
  op: string;
  label: string;
  /** Asked before running; `{n}` becomes the number selected. */
  confirm?: string;
  danger?: boolean;
};
export type BulkField = { name: string; label: string; type?: "text" | "number"; placeholder?: string };

const boxes = (form: string) =>
  [...document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name=ids][form="${form}"]`)].filter(
    (b) => !b.disabled,
  );

/** Tick box for one row. Lives anywhere on the page and belongs to the bulk form `form`. */
export function BulkCheck({ form, value, label }: { form: string; value: string; label: string }) {
  return (
    <input type="checkbox" className="bulk-check" name="ids" value={value} form={form} aria-label={label} />
  );
}

/** "Select all on this page" tick box (for a table header). */
export function BulkAll({ form }: { form: string }) {
  const [all, setAll] = useState(false);
  useEffect(() => {
    const sync = () => {
      const b = boxes(form);
      setAll(b.length > 0 && b.every((x) => x.checked));
    };
    document.addEventListener("change", sync);
    document.addEventListener("bulk-sync", sync);
    return () => {
      document.removeEventListener("change", sync);
      document.removeEventListener("bulk-sync", sync);
    };
  }, [form]);
  return (
    <input
      type="checkbox"
      className="bulk-check"
      aria-label="Select all on this page"
      checked={all}
      onChange={(e) => {
        for (const b of boxes(form)) b.checked = e.target.checked;
        document.dispatchEvent(new Event("bulk-sync"));
      }}
    />
  );
}

/**
 * Do one thing to many rows: tick rows (BulkCheck), pick an action here.
 * The server action gets `ids` (all ticked values), `op` and any extra `fields`.
 */
export function BulkBar({
  id,
  action,
  ops,
  fields = [],
  noun = "item",
}: {
  id: string;
  action: Action;
  ops: BulkOp[];
  fields?: BulkField[];
  noun?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const sync = () => setCount(boxes(id).filter((b) => b.checked).length);
    sync();
    document.addEventListener("change", sync);
    document.addEventListener("bulk-sync", sync);
    return () => {
      document.removeEventListener("change", sync);
      document.removeEventListener("bulk-sync", sync);
    };
  }, [id]);

  // Done: untick everything (rows may have changed or gone).
  useEffect(() => {
    if (!state.ok) return;
    for (const b of boxes(id)) b.checked = false;
    document.dispatchEvent(new Event("bulk-sync"));
  }, [state, id]);

  const plural = count === 1 ? noun : noun.endsWith("y") ? `${noun.slice(0, -1)}ies` : `${noun}s`;
  return (
    <form
      id={id}
      ref={ref}
      action={formAction}
      className={"bulk-bar" + (count ? " active" : "")}
      aria-busy={pending}
      onSubmit={(e) => {
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const op = ops.find((o) => o.op === submitter?.value);
        e.preventDefault();
        if (!count) return;
        if (op?.confirm && !window.confirm(op.confirm.replaceAll("{n}", String(count)))) return;
        // Sent by hand: React's automatic submit resets the form, which would untick the rows on an error.
        const data = new FormData(e.currentTarget, submitter);
        startTransition(() => formAction(data));
      }}
    >
      <span className="bulk-count">
        {count ? (
          <>
            <b>{count}</b> {plural} selected
          </>
        ) : (
          <span className="muted">Tick the boxes to act on several at once</span>
        )}
      </span>
      {count > 0 && (
        <>
          {fields.map((f) => (
            <input
              key={f.name}
              name={f.name}
              type={f.type ?? "text"}
              placeholder={f.placeholder ?? f.label}
              aria-label={f.label}
              maxLength={f.type === "number" ? undefined : 500}
            />
          ))}
          <span className="bulk-ops">
            {ops.map((o) => (
              <button
                key={o.op}
                name="op"
                value={o.op}
                className={o.danger ? "outline danger-outline" : "outline"}
                disabled={pending}
              >
                {o.label}
              </button>
            ))}
            <button
              type="button"
              className="text-link"
              onClick={() => {
                for (const b of boxes(id)) b.checked = false;
                document.dispatchEvent(new Event("bulk-sync"));
              }}
            >
              Clear
            </button>
          </span>
        </>
      )}
      {pending && <Loader2 className="spin" size={16} />}
      {(state.ok || state.error) && !pending && (
        <p key={state.at} className={state.error ? "form-msg error" : "form-msg ok"} role="status">
          {state.error ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />} {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
