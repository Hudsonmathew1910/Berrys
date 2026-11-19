"use client";
import { useActionState, useEffect, useRef } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import type { ActionResult } from "@/app/[dash]/actions";

type Action = (prev: ActionResult, data: FormData) => Promise<ActionResult>;

/**
 * A form wired to a server action, showing the result message inline.
 * `confirm` asks before submitting; `resetOnSuccess` clears the inputs.
 */
export function ActionForm({
  action,
  children,
  className = "",
  confirm,
  resetOnSuccess = false,
  inline = false,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  resetOnSuccess?: boolean;
  inline?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={ref}
      action={formAction}
      className={(inline ? "dash-inline-form " : "dash-form ") + className}
      aria-busy={pending}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <fieldset disabled={pending}>{children}</fieldset>
      {(state.ok || state.error) && (
        <p key={state.at} className={state.error ? "form-msg error" : "form-msg ok"} role="status">
          {state.error ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />} {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
