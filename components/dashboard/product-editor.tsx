"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, Loader2, Upload, X } from "lucide-react";
import { applyOffer, MAX_IMAGES, money, type Category } from "@/lib/catalog";
import { api } from "@/components/store/api";
import { saveProductAction } from "@/app/[dash]/actions";

export type OfferChoice = "better" | "skip" | "both" | "replace";
const choiceText: Record<OfferChoice, string> = {
  better: "Lower price wins",
  skip: "Sale price only (offer skips it)",
  both: "Apply both (offer off the sale price)",
  replace: "Offer replaces the sale price while it runs",
};
const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });

/** A category / store / product offer that also covers this product. */
export type CoveringOffer = {
  id: string;
  name: string;
  type: "percent" | "flat";
  value: number;
  active: boolean;
  endsAt: string | null;
  choice: OfferChoice;
};

export type EditableProduct = {
  id: string;
  name: string;
  category: string;
  gender: "girls" | "boys" | "unisex";
  tags: string[];
  /** MRP. */
  price: number;
  /** Own sale price (0 = none) and its window, India time yyyy-MM-ddTHH:mm. */
  salePrice: number;
  saleStartsAt: string;
  saleEndsAt: string;
  description: string;
  images: string[];
  badge: string;
  color: string;
  active: boolean;
  stock: Record<string, number>;
  /** Last saved version (existing products), for safe concurrent editing. */
  version?: string;
};

/** Create / edit a product: photos (up to 6), details, tags, and stock for each size of its category. */
export function ProductEditor({
  initial,
  categories,
  listHref,
  offers = [],
}: {
  initial: EditableProduct;
  categories: Pick<Category, "name" | "sizes">[];
  listHref: string;
  /** Offers that also cover this product (existing products). */
  offers?: CoveringOffer[];
}) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [tagText, setTagText] = useState(initial.tags.join(", "));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [state, action, pending] = useActionState(saveProductAction, {});
  const [choices, setChoices] = useState<Record<string, OfferChoice>>({});
  const set = (patch: Partial<EditableProduct>) => setP((x) => ({ ...x, ...patch }));
  const sizes = categories.find((c) => c.name === p.category)?.sizes ?? [];

  useEffect(() => {
    if (state.ok && !initial.id) router.push(listHref);
  }, [state, initial.id, listHref, router]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setUploadError("");
    try {
      const room = MAX_IMAGES - p.images.length;
      const urls: string[] = [];
      for (const file of [...files].slice(0, room)) {
        const body = new FormData();
        body.set("file", file);
        urls.push((await api<{ url: string }>("/api/admin/upload", { method: "POST", body })).url);
      }
      setP((x) => ({ ...x, images: [...x.images, ...urls].slice(0, MAX_IMAGES) }));
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const move = (i: number, d: -1 | 1) =>
    setP((x) => {
      const images = [...x.images];
      [images[i], images[i + d]] = [images[i + d], images[i]];
      return { ...x, images };
    });

  const payload = JSON.stringify({
    ...p,
    tags: tagText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    stock: Object.fromEntries(sizes.map((s) => [s, p.stock[s] ?? 0])),
    // What the form started from: the server applies only the difference.
    stockBase: initial.id ? initial.stock : undefined,
    version: initial.version,
    offerChoices: p.salePrice > 0 ? choices : {},
  });

  return (
    <form action={action} className="product-editor">
      <input type="hidden" name="payload" value={payload} />

      <section className="dash-panel">
        <h2>
          Photos ({p.images.length}/{MAX_IMAGES})
        </h2>
        <p className="muted">The first photo is the main one in the shop.</p>
        <div className="image-grid">
          {p.images.map((src, i) => (
            <div key={src + i} className="image-tile">
              <img src={src} alt={`Photo ${i + 1}`} />
              {i === 0 && <span className="tag">Main</span>}
              <div className="image-tools">
                <button
                  type="button"
                  aria-label="Move earlier"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  aria-label="Move later"
                  disabled={i === p.images.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => set({ images: p.images.filter((_, j) => j !== i) })}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          ))}
          {p.images.length < MAX_IMAGES && (
            <label className="image-tile add">
              {uploading ? <Loader2 className="spin" /> : <Upload />}
              <span>{uploading ? "Uploading…" : "Add photos"}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={uploading}
                onChange={(e) => {
                  upload(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
        {uploadError && <p className="form-msg error">{uploadError}</p>}
        <small className="muted">JPG, PNG or WebP · up to 5 MB each</small>
      </section>

      <section className="dash-panel">
        <h2>Details</h2>
        <div className="form-grid">
          <label className="wide">
            Product name
            <input
              required
              minLength={2}
              maxLength={100}
              value={p.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </label>
          <label>
            Category
            <select value={p.category} onChange={(e) => set({ category: e.target.value })} required>
              <option value="" disabled>
                Choose…
              </option>
              {categories.map((c) => (
                <option key={c.name}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            For
            <select
              value={p.gender}
              onChange={(e) => set({ gender: e.target.value as EditableProduct["gender"] })}
            >
              <option value="unisex">Unisex</option>
              <option value="girls">Girls</option>
              <option value="boys">Boys</option>
            </select>
          </label>
          <label>
            MRP (₹)
            <input
              type="number"
              min={1}
              step={1}
              required
              value={p.price}
              onChange={(e) => set({ price: Number(e.target.value) })}
            />
            <small className="muted">The normal price.</small>
          </label>
          <label>
            Sale price (₹, optional)
            <input
              type="number"
              min={0}
              max={Math.max(0, p.price - 1)}
              step={1}
              value={p.salePrice || ""}
              placeholder="No sale"
              onChange={(e) => set({ salePrice: Number(e.target.value) || 0 })}
            />
            <small className="muted">
              {p.salePrice > 0 && p.salePrice < p.price
                ? `${Math.round((1 - p.salePrice / p.price) * 100)}% off the MRP · listed under Offers → Sale prices`
                : "Leave empty to sell at the MRP."}
            </small>
          </label>
          {p.salePrice > 0 && (
            <>
              <label>
                Sale starts (India time)
                <input
                  type="datetime-local"
                  value={p.saleStartsAt}
                  onChange={(e) => set({ saleStartsAt: e.target.value })}
                />
                <small className="muted">Empty = now</small>
              </label>
              <label>
                Sale ends
                <input
                  type="datetime-local"
                  value={p.saleEndsAt}
                  onChange={(e) => set({ saleEndsAt: e.target.value })}
                />
                <small className="muted">Empty = no end</small>
              </label>
            </>
          )}{" "}
          <label className="wide">
            Description
            <textarea
              rows={5}
              maxLength={5000}
              value={p.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </label>
          <label className="wide">
            Search tags (comma separated)
            <input
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              placeholder="cotton, summer, floral"
            />
          </label>
          <label>
            Badge (optional)
            <input
              maxLength={40}
              value={p.badge}
              placeholder="NEW ARRIVAL"
              onChange={(e) => set({ badge: e.target.value })}
            />
          </label>
          <label>
            Colour swatch
            <input type="color" value={p.color} onChange={(e) => set({ color: e.target.value })} />
          </label>
          <label className="check wide">
            <input type="checkbox" checked={p.active} onChange={(e) => set({ active: e.target.checked })} />{" "}
            Visible in the shop
          </label>
        </div>
      </section>

      <section className="dash-panel">
        <h2>Stock by size</h2>
        {sizes.length ? (
          <div className="stock-fields">
            {sizes.map((s) => (
              <label key={s}>
                {s}
                <input
                  type="number"
                  min={0}
                  max={100000}
                  step={1}
                  value={p.stock[s] ?? 0}
                  onChange={(e) => set({ stock: { ...p.stock, [s]: Number(e.target.value) } })}
                />
                {!p.stock[s] && <small>Sold out</small>}
              </label>
            ))}
          </div>
        ) : (
          <p className="muted">Choose a category to see its sizes.</p>
        )}
      </section>

      {p.salePrice > 0 && p.salePrice < p.price && offers.length > 0 && (
        <section className="dash-panel offer-conflicts">
          <h2>Offers that also cover this product</h2>
          <p className="muted">
            It has a sale price of {money(p.salePrice)} (MRP {money(p.price)}). Choose how each offer treats
            it — the price is what customers would pay while the offer runs.
          </p>
          <div className="table-scroll">
            <table className="dash-table compact">
              <thead>
                <tr>
                  <th>Offer</th>
                  <th>Runs</th>
                  <th>Choice (customer pays)</th>
                </tr>
              </thead>
              <tbody>
                {offers.map((o) => {
                  const fromMrp = applyOffer(o, p.price);
                  const prices: Record<OfferChoice, number> = {
                    better: Math.min(p.salePrice, fromMrp),
                    skip: p.salePrice,
                    both: applyOffer(o, p.salePrice),
                    replace: fromMrp,
                  };
                  return (
                    <tr key={o.id}>
                      <td>
                        {o.name}
                        <small className="block muted">
                          {o.type === "percent" ? `${o.value}% off` : `${money(o.value)} off`}
                          {!o.active && " · switched off"}
                        </small>
                      </td>
                      <td className="muted">{o.endsAt ? `until ${fmt(o.endsAt)}` : "no end date"}</td>
                      <td>
                        <select
                          aria-label={`Choice for ${o.name}`}
                          value={choices[o.id] ?? o.choice}
                          onChange={(e) =>
                            setChoices((c) => ({ ...c, [o.id]: e.target.value as OfferChoice }))
                          }
                        >
                          {(Object.keys(choiceText) as OfferChoice[]).map((c) => (
                            <option key={c} value={c}>
                              {choiceText[c]} → {money(prices[c])}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="editor-actions">
        {" "}
        {(state.ok || state.error) && (
          <p key={state.at} className={state.error ? "form-msg error" : "form-msg ok"} role="status">
            {state.error ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />} {state.error ?? state.ok}
          </p>
        )}
        <button className="primary" disabled={pending || uploading || !p.images.length}>
          {pending && <Loader2 className="spin" size={16} />} {initial.id ? "Save changes" : "Add product"}
        </button>
      </div>
    </form>
  );
}
