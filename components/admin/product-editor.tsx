"use client";
import { useState } from "react";
import { Check, Loader2, Upload, X } from "lucide-react";
import { productCategories, sizes, type Product } from "@/lib/catalog";
import { api } from "@/components/store/api";
import { IconButton, Overlay } from "@/components/store/modal";
import { useToast } from "@/components/store/toast";

export function ProductEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: Product;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [edit, setEdit] = useState<Product>(initial);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Product>) => setEdit((p) => ({ ...p, ...patch }));

  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const { url } = await api<{ url: string }>("/api/admin/upload", { method: "POST", body });
      set({ image: url });
      toast("Photo uploaded. Save the product to publish it.");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/admin/products", { method: "POST", json: edit });
      await onSaved();
      toast("Product saved. Your storefront is up to date.");
      onClose();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <section
        className="edit-modal modal"
        role="dialog"
        aria-modal="true"
        aria-label={edit.id ? "Edit product" : "Add product"}
      >
        <div className="drawer-header">
          <div>
            <div className="eyebrow">BERRY’S PRODUCT STUDIO</div>
            <h2>{edit.id ? "Perfect the little details." : "Add a little favourite."}</h2>
          </div>
          <IconButton label="Close product editor" onClick={onClose}>
            <X />
          </IconButton>
        </div>
        <form onSubmit={save}>
          <div className="edit-grid">
            <div>
              <label className="upload-box">
                {edit.image ? (
                  <img src={edit.image} alt="Product preview" />
                ) : (
                  <>
                    <Upload size={29} />
                    <b>Add a product photo</b>
                  </>
                )}
                <span>
                  <Upload size={15} /> {busy ? "Uploading…" : "Choose photo"}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={(e) => upload(e.target.files?.[0])}
                />
              </label>
              <small className="muted">JPG, PNG or WebP · up to 5 MB</small>
            </div>
            <div className="edit-fields">
              <label>
                Product name
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  value={edit.name}
                  onChange={(e) => set({ name: e.target.value })}
                />
              </label>
              <label>
                Category
                <select value={edit.category} onChange={(e) => set({ category: e.target.value })}>
                  {productCategories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <div className="field-row">
                <label>
                  Selling price (₹)
                  <input
                    required
                    type="number"
                    min={1}
                    step={1}
                    value={edit.price}
                    onChange={(e) => set({ price: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Original price (₹)
                  <input
                    required
                    type="number"
                    min={edit.price}
                    step={1}
                    value={edit.originalPrice}
                    onChange={(e) => set({ originalPrice: Number(e.target.value) })}
                  />
                </label>
              </div>
              <label>
                Description
                <textarea
                  maxLength={3000}
                  value={edit.description}
                  onChange={(e) => set({ description: e.target.value })}
                />
              </label>
              <div className="field-row">
                <label>
                  Product badge
                  <input
                    maxLength={40}
                    placeholder="e.g. NEW ARRIVAL"
                    value={edit.badge}
                    onChange={(e) => set({ badge: e.target.value })}
                  />
                </label>
                <label>
                  Colour swatch
                  <input type="color" value={edit.color} onChange={(e) => set({ color: e.target.value })} />
                </label>
              </div>
            </div>
          </div>
          <div className="stock-editor">
            <h3>A place for every size.</h3>
            <p>Enter the number of pieces available. Set 0 to mark a size as sold out.</p>
            <div className="stock-fields">
              {sizes.map((s) => (
                <label key={s}>
                  Size {s}
                  <input
                    type="number"
                    required
                    min={0}
                    max={100000}
                    step={1}
                    value={edit.stock[s] ?? 0}
                    onChange={(e) => set({ stock: { ...edit.stock, [s]: Number(e.target.value) } })}
                  />
                  {!edit.stock[s] && <small>Sold out</small>}
                </label>
              ))}
            </div>
          </div>
          <div className="edit-actions">
            <button type="button" className="outline" onClick={onClose}>
              Cancel
            </button>
            <button className="primary" disabled={busy || !edit.image}>
              {busy ? <Loader2 className="spin" size={17} /> : <Check size={17} />}Save product
            </button>
          </div>
        </form>
      </section>
    </Overlay>
  );
}
