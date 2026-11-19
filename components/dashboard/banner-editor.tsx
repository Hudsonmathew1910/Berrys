"use client";
import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Upload, X } from "lucide-react";
import type { Banner } from "@/lib/content";
import { api } from "@/components/store/api";
import { saveContentAction } from "@/app/[dash]/actions";

type ProductOption = { id: string; name: string; category: string; image: string };

/** Edit the three home page banners: text, category, product and photo. */
export function BannerEditor({
  initial,
  categories,
  products,
}: {
  initial: Banner[];
  categories: string[];
  products: ProductOption[];
}) {
  const [banners, setBanners] = useState(initial);
  const [uploading, setUploading] = useState(-1);
  const [uploadError, setUploadError] = useState("");
  const [state, action, pending] = useActionState(saveContentAction, {});
  const set = (i: number, patch: Partial<Banner>) =>
    setBanners((all) => all.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  async function upload(i: number, file?: File) {
    if (!file) return;
    setUploading(i);
    setUploadError("");
    try {
      const body = new FormData();
      body.set("file", file);
      set(i, { image: (await api<{ url: string }>("/api/admin/upload", { method: "POST", body })).url });
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(-1);
    }
  }

  return (
    <form action={action} className="banner-editor">
      <input type="hidden" name="key" value="banners" />
      <div className="banner-cards">
        {banners.map((b, i) => {
          const category = b.category || categories[i] || "";
          const product = products.find((p) => p.id === b.productId);
          const fallback = products.find((p) => p.category === category);
          const preview = b.image || product?.image || fallback?.image;
          const listed = products.filter((p) => !b.category || p.category === b.category);
          return (
            <fieldset key={i} className="banner-card">
              <legend>{i === 0 ? "Banner 1 (large)" : `Banner ${i + 1}`}</legend>
              {/* Every field is submitted as b{i}_{field}. */}
              {(
                ["eyebrow", "title", "titleEm", "text", "cta", "category", "productId", "image"] as const
              ).map((k) => (
                <input key={k} type="hidden" name={`b${i}_${k}`} value={b[k]} />
              ))}

              <div className="banner-preview">
                {preview ? <img src={preview} alt="" /> : <span className="muted">No photo yet</span>}
                <label className="outline small">
                  {uploading === i ? <Loader2 className="spin" size={14} /> : <Upload size={14} />} Upload
                  photo
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploading !== -1}
                    onChange={(e) => {
                      upload(i, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                {b.image && (
                  <button type="button" className="text-link" onClick={() => set(i, { image: "" })}>
                    <X size={13} /> Use product photo instead
                  </button>
                )}
              </div>

              <label>
                Category (link & “From ₹” price)
                <select
                  value={b.category}
                  onChange={(e) => set(i, { category: e.target.value, productId: "" })}
                >
                  <option value="">Automatic ({categories[i] ?? "none"})</option>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Product photo
                <select value={b.productId} onChange={(e) => set(i, { productId: e.target.value })}>
                  <option value="">Automatic (first in category)</option>
                  {listed.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Small label
                <input
                  value={b.eyebrow}
                  maxLength={60}
                  placeholder={category.toUpperCase()}
                  onChange={(e) => set(i, { eyebrow: e.target.value })}
                />
              </label>
              <label>
                Title
                <input value={b.title} maxLength={80} onChange={(e) => set(i, { title: e.target.value })} />
              </label>
              <label>
                Title, second line (italic, optional)
                <input
                  value={b.titleEm}
                  maxLength={80}
                  onChange={(e) => set(i, { titleEm: e.target.value })}
                />
              </label>
              <label>
                Text (optional)
                <input value={b.text} maxLength={120} onChange={(e) => set(i, { text: e.target.value })} />
              </label>
              <label>
                Button text
                <input
                  value={b.cta}
                  maxLength={40}
                  placeholder={`Shop ${category.toLowerCase()}`}
                  onChange={(e) => set(i, { cta: e.target.value })}
                />
              </label>
            </fieldset>
          );
        })}
      </div>
      {uploadError && <p className="form-msg error">{uploadError}</p>}
      <div className="button-row">
        <button className="primary" disabled={pending || uploading !== -1}>
          {pending && <Loader2 className="spin" size={15} />} Save banners
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
