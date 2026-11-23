"use client";
import { startTransition, useActionState, useEffect, useRef } from "react";
import { CheckCircle2, AlertCircle, TriangleAlert } from "lucide-react";
import type { ActionResult } from "@/app/[dash]/actions";

type Action = (prev: ActionResult, data: FormData) => Promise<ActionResult>;

/** Fired on a form when its server action has answered (detail: the ActionResult). */
export const FORM_DONE = "dash-form-done";

/** A warning popup shown before saving when the checkbox `field` is switched off. */
export type ConfirmOff = {
  field: string;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
};

/**
 * A form wired to a server action, showing the result message inline.
 * `confirm` asks before submitting; `confirmOff` shows a warning popup when a switch is turned off;
 * `resetOnSuccess` clears the inputs.
 */
export function ActionForm({
  action,
  children,
  className = "",
  confirm,
  confirmOff,
  resetOnSuccess = false,
  inline = false,
  saveAll = false,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  confirmOff?: ConfirmOff;
  resetOnSuccess?: boolean;
  inline?: boolean;
  /** Edited forms are saved together by the page's "Save all" bar. */
  saveAll?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const approved = useRef(false);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
    if (state.at) ref.current?.dispatchEvent(new CustomEvent(FORM_DONE, { detail: state, bubbles: true }));
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={ref}
      action={formAction}
      className={(inline ? "dash-inline-form " : "dash-form ") + className}
      aria-busy={pending}
      data-save-all={saveAll ? "" : undefined}
      onSubmit={(e) => {
        if (confirmOff && !approved.current) {
          const box = e.currentTarget.elements.namedItem(confirmOff.field);
          if (box instanceof HTMLInputElement && !box.checked) {
            e.preventDefault();
            dialog.current?.showModal();
            return;
          }
        }
        approved.current = false;
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        // Sent by hand (not React's automatic form submit) so a failed save keeps what was typed.
        const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(data));
      }}
    >
      <fieldset disabled={pending}>{children}</fieldset>
      {(state.ok || state.error) && (
        <p key={state.at} className={state.error ? "form-msg error" : "form-msg ok"} role="status">
          {state.error ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />} {state.error ?? state.ok}
        </p>
      )}
      {confirmOff && (
        <dialog
          ref={dialog}
          className="confirm-dialog"
          aria-labelledby="confirm-dialog-title"
          onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        >
          <h3 id="confirm-dialog-title">
            <TriangleAlert size={18} /> {confirmOff.title}
          </h3>
          <div className="confirm-dialog-body">{confirmOff.message}</div>
          <div className="confirm-dialog-actions">
            <button type="button" className="outline" autoFocus onClick={() => dialog.current?.close()}>
              Cancel
            </button>
            <button
              type="button"
              className="primary danger"
              onClick={() => {
                dialog.current?.close();
                approved.current = true;
                ref.current?.requestSubmit();
              }}
            >
              {confirmOff.confirmLabel}
            </button>
          </div>
        </dialog>
      )}
    </form>
  );
}
