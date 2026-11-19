"use client";
import { useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { api } from "@/components/store/api";

/** Image upload for a settings form: uploads, previews and keeps the URL in a hidden input. */
export function ImageField({
  name,
  label,
  initial,
  hint,
  fallback,
}: {
  name: string;
  label: string;
  initial: string;
  hint?: string;
  /** Shown (greyed) when nothing is uploaded: the built-in image. */
  fallback?: string;
}) {
  const [url, setUrl] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("file", file);
      setUrl((await api<{ url: string }>("/api/admin/upload", { method: "POST", body })).url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="image-field">
      <span className="image-field-label">{label}</span>
      <input type="hidden" name={name} value={url} />
      <div className="image-field-row">
        <span className={"image-field-preview" + (url ? "" : " fallback")}>
          {url || fallback ? <img src={url || fallback} alt="" /> : <span>None</span>}
        </span>
        <label className="outline image-field-btn">
          {busy ? <Loader2 className="spin" size={15} /> : <Upload size={15} />} {url ? "Replace" : "Upload"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            disabled={busy}
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </label>
        {url && (
          <button type="button" className="text-link" onClick={() => setUrl("")}>
            <X size={14} /> Use default
          </button>
        )}
      </div>
      {hint && <small className="muted">{hint}</small>}
      {error && <small className="form-msg error">{error}</small>}
    </div>
  );
}
