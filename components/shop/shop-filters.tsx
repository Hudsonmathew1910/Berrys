"use client";
import { SlidersHorizontal } from "lucide-react";
import { sizes } from "@/lib/catalog";

/**
 * Sort / size / in-stock controls. A plain GET form, so filters live in the
 * URL (shareable, back-button friendly) and work without JavaScript.
 * Changing a control resets to page 1.
 */
export function ShopFilters(p: {
  category?: string;
  q?: string;
  sort: string;
  size?: string;
  stock: boolean;
}) {
  const submit = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) =>
    e.currentTarget.form?.requestSubmit();
  return (
    <form className="collection-tools shop-filters" action="/shop">
      {p.category && <input type="hidden" name="category" value={p.category} />}
      {p.q && <input type="hidden" name="q" value={p.q} />}
      <div>
        <SlidersHorizontal size={16} />
        <label>
          Size{" "}
          <select name="size" defaultValue={p.size ?? ""} onChange={submit}>
            <option value="">All sizes</option>
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" name="stock" value="1" defaultChecked={p.stock} onChange={submit} /> In stock
          only
        </label>
      </div>
      <label>
        Sort by{" "}
        <select name="sort" defaultValue={p.sort} onChange={submit} aria-label="Sort products">
          <option value="featured">Featured</option>
          <option value="new">Newest</option>
          <option value="price-low">Price: low to high</option>
          <option value="price-high">Price: high to low</option>
          <option value="name">Name: A to Z</option>
        </select>
      </label>
      <noscript>
        <button type="submit">Apply</button>
      </noscript>
    </form>
  );
}
