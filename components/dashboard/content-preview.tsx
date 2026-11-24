"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, Monitor, Smartphone, X } from "lucide-react";
import { PREVIEW_MESSAGE, type EditTarget, type TemplateContent } from "./home-template";

/** The content form for a block ("home", "banners", …) on this page. */
const formFor = (key: string) =>
  document.querySelector<HTMLInputElement>(`form[data-save-all] input[name="key"][value="${key}"]`)?.form ??
  null;

/** Everything in the content forms right now (saved or not), shaped for the template. */
function collect(): TemplateContent {
  const data = (key: string) => {
    const f = formFor(key);
    return f ? new FormData(f) : new FormData();
  };
  const fields = (fd: FormData) =>
    Object.fromEntries([...fd.entries()].filter(([k]) => k !== "key").map(([k, v]) => [k, String(v)]));
  const ann = data("announcement");
  const ban = data("banners");
  const sec = data("homeSections");
  return {
    announcement: [0, 1, 2].map((i) => String(ann.get(`item${i}`) ?? "")),
    home: fields(data("home")),
    banners: [0, 1, 2].map((i) =>
      Object.fromEntries(
        ["eyebrow", "title", "titleEm", "text", "cta", "category", "productId", "image"].map((k) => [
          k,
          String(ban.get(`b${i}_${k}`) ?? ""),
        ]),
      ),
    ),
    sections: {
      shelfCategories: sec.getAll("shelfCategories").map(String),
      offers: sec.getAll("offers").map(String),
      offersTitle: String(sec.get("offersTitle") ?? ""),
    },
    footer: fields(data("footer")),
  };
}

/** Types into a form field as if by hand, so React forms and "Save all" notice the change. */
function fill(target: EditTarget, value: string) {
  const el =
    target.form === "banners"
      ? document.querySelector<HTMLInputElement>(`[data-field="${target.field}"]`)
      : (formFor(target.form)?.elements.namedItem(target.field) as
          | HTMLInputElement
          | HTMLTextAreaElement
          | null);
  if (!el) return;
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * "Preview": the home page as a template with what's in the forms now — saved or not.
 * It updates as you type here; clicking text in it and typing fills in the form for you.
 */
export function ContentPreview() {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const last = useRef("");

  const send = useCallback((force = false) => {
    const content = collect();
    const json = JSON.stringify(content);
    if (!force && json === last.current) return;
    last.current = json;
    frame.current?.contentWindow?.postMessage({ type: PREVIEW_MESSAGE, content }, window.location.origin);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== PREVIEW_MESSAGE) return;
      if (e.data.ready) send(true);
      if (e.data.edit) fill(e.data.edit as EditTarget, String(e.data.value ?? ""));
    };
    const onChange = () => send();
    window.addEventListener("message", onMessage);
    document.addEventListener("input", onChange, true);
    document.addEventListener("change", onChange, true);
    // Banner photos and pickers update hidden fields without events: check a few times a second.
    const every = setInterval(() => send(), 500);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("input", onChange, true);
      document.removeEventListener("change", onChange, true);
      window.removeEventListener("keydown", onKey);
      clearInterval(every);
    };
  }, [open, send]);

  return (
    <>
      <button type="button" className="outline" onClick={() => setOpen(true)}>
        <Eye size={15} /> Preview
      </button>
      {open &&
        // On <body>, so the dashboard's page animation can't trap it inside the page area.
        createPortal(
          <div className="content-preview" role="dialog" aria-label="Home page preview">
            <div className="content-preview-bar">
              <span>
                <b>Home page preview</b> — template with your text, as it is now (not saved yet). Click text
                to edit it.
              </span>
              <span className="content-preview-tools">
                <button
                  type="button"
                  className={phone ? "" : "on"}
                  onClick={() => setPhone(false)}
                  aria-pressed={!phone}
                >
                  <Monitor size={15} /> Desktop
                </button>
                <button
                  type="button"
                  className={phone ? "on" : ""}
                  onClick={() => setPhone(true)}
                  aria-pressed={phone}
                >
                  <Smartphone size={15} /> Phone
                </button>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close preview">
                  <X size={16} /> Close
                </button>
              </span>
            </div>
            <div className="content-preview-stage">
              <iframe
                ref={frame}
                title="Home page template"
                src="/content-preview"
                className={phone ? "phone" : ""}
                onLoad={() => send(true)}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
