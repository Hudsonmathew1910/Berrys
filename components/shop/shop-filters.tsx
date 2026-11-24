"use client";
import { SlidersHorizontal } from "lucide-react";

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
  gender?: string;
  sizes: string[];
  /** Other filters to keep (on sale / offer). */
  extra?: Record<string, string | undefined>;
}) {
  const submit = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) =>
    e.currentTarget.form?.requestSubmit();
  return (
    <form className="collection-tools shop-filters" action="/shop">
      {p.category && <input type="hidden" name="category" value={p.category} />}
      {p.q && <input type="hidden" name="q" value={p.q} />}
      {Object.entries(p.extra ?? {}).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      <div>
        <SlidersHorizontal size={16} />
        <label>
          Size{" "}
          <select name="size" defaultValue={p.size ?? ""} onChange={submit}>
            <option value="">All sizes</option>
            {p.sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          For{" "}
          <select name="gender" defaultValue={p.gender ?? ""} onChange={submit}>
            <option value="">Everyone</option>
            <option value="girls">Girls</option>
            <option value="boys">Boys</option>
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
