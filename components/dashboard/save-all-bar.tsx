"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Save, Undo2 } from "lucide-react";
import { FORM_DONE } from "./action-form";
import type { ActionResult } from "@/app/[dash]/actions";

const DIRTY = "form[data-save-all][data-dirty]";
const dirtyForms = () => [...document.querySelectorAll<HTMLFormElement>(DIRTY)];

/** Submits one form and waits for its server action to answer. */
function submitAndWait(form: HTMLFormElement) {
  return new Promise<ActionResult>((resolve) => {
    const timer = setTimeout(() => finish({ error: "No answer from the server." }), 60_000);
    function finish(r: ActionResult) {
      clearTimeout(timer);
      form.removeEventListener(FORM_DONE, onDone);
      resolve(r);
    }
    const onDone = (e: Event) => finish((e as CustomEvent<ActionResult>).detail ?? {});
    form.addEventListener(FORM_DONE, onDone);
    form.requestSubmit();
  });
}

/**
 * Sticky "Save all" bar for the dashboard: notices every edited form marked `data-save-all`
 * on the page and saves them one after another with a single click.
 */
export function SaveAllBar() {
  // A new page has its own forms: start fresh.
  return <Bar key={usePathname()} />;
}

function Bar() {
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: number; failed: number } | null>(null);
  const [present, setPresent] = useState(false);
  const recount = useCallback(() => setCount(document.querySelectorAll(DIRTY).length), []);

  // Does this page have any forms that "Save all" can save? (Pages can stream in after this mounts.)
  useEffect(() => {
    const look = () => setPresent(!!document.querySelector("form[data-save-all]"));
    const frame = requestAnimationFrame(look);
    const watch = new MutationObserver(look);
    watch.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      watch.disconnect();
    };
  }, []);

  useEffect(() => {
    const touch = (e: Event) => {
      const form = (e.target as Element | null)?.closest?.("form[data-save-all]");
      if (form instanceof HTMLFormElement && e.target !== form) {
        form.dataset.dirty = "";
        setResult(null);
        recount();
      }
    };
    const clean = (e: Event) => {
      const form = e.target as HTMLElement;
      if (!form.matches?.("form[data-save-all]")) return;
      if (
        e.type === "reset" ||
        ((e as CustomEvent<ActionResult>).detail?.ok && !(e as CustomEvent<ActionResult>).detail?.error)
      )
        delete form.dataset.dirty;
      recount();
    };
    const warn = (e: BeforeUnloadEvent) => {
      if (document.querySelector(DIRTY)) e.preventDefault();
    };
    document.addEventListener("input", touch, true);
    document.addEventListener("change", touch, true);
    document.addEventListener("reset", clean, true);
    document.addEventListener(FORM_DONE, clean);
    window.addEventListener("beforeunload", warn);
    return () => {
      document.removeEventListener("input", touch, true);
      document.removeEventListener("change", touch, true);
      document.removeEventListener("reset", clean, true);
      document.removeEventListener(FORM_DONE, clean);
      window.removeEventListener("beforeunload", warn);
    };
  }, [recount]);

  async function saveAll() {
    setBusy(true);
    let ok = 0;
    let failed = 0;
    for (const form of dirtyForms()) {
      if (!form.isConnected) continue;
      if (!form.checkValidity()) {
        form.reportValidity();
        failed++;
        continue;
      }
      const r = await submitAndWait(form);
      if (r.error) failed++;
      else ok++;
    }
    setBusy(false);
    setResult({ ok, failed });
    recount();
    if (failed) document.querySelector(DIRTY)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function discard() {
    for (const form of dirtyForms()) form.reset();
    setResult(null);
    recount();
  }

  // Shown at the top of every page that has editable forms; actions appear once something changes.
  if (!present) return null;
  return (
    <div className={"save-all-bar" + (count ? " dirty" : "")} role="region" aria-label="Save changes">
      <span className="save-all-status">
        {count ? (
          <span>
            <b>{count}</b> unsaved {count === 1 ? "change" : "changes"} on this page
          </span>
        ) : result && !result.failed ? (
          <span className="form-msg ok">
            <CheckCircle2 size={15} /> Saved {result.ok} {result.ok === 1 ? "change" : "changes"}.
          </span>
        ) : (
          <span className="muted">No unsaved changes</span>
        )}
        {result?.failed ? (
          <span className="form-msg error">
            <AlertCircle size={15} /> {result.ok ? `Saved ${result.ok}. ` : ""}
            {result.failed} couldn’t be saved — see the red message.
          </span>
        ) : null}
      </span>
      <span className="save-all-actions">
        {count > 0 && (
          <button type="button" className="save-all-clear" onClick={discard} disabled={busy}>
            <Undo2 size={15} /> Clear changes
          </button>
        )}
        <button type="button" className="save-all-save" onClick={saveAll} disabled={busy || !count}>
          {busy ? <Loader2 className="spin" size={15} /> : <Save size={15} />} Save all
        </button>
      </span>
    </div>
  );
}
