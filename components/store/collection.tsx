"use client";
import { useMemo, useState } from "react";
import { AlertCircle, ArrowRight, ChevronDown, Heart, Plus, Search, SlidersHorizontal } from "lucide-react";
import { categories, discountPercent, isSoldOut, money, sizes, type Product } from "@/lib/catalog";
import { toggleLike } from "./bag";
import { IconButton } from "./modal";

type Props = {
  products: Product[];
  likes: string[];
  category: string;
  query: string;
  favouritesOnly: boolean;
  error: string;
  onCategory: (category: string) => void;
  onResetAll: () => void;
  onRetry: () => void;
  onChoose: (product: Product, size?: string) => void;
};

type Sort = "featured" | "price-low" | "price-high" | "name";

/** The searchable, filterable product grid. */
export function Collection(p: Props) {
  const [sort, setSort] = useState<Sort>("featured");
  const [inStock, setInStock] = useState(false);
  const [sizeFilter, setSizeFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const visible = useMemo(() => {
    const q = p.query.toLowerCase();
    const list = p.products.filter(
      (x) =>
        (p.category === "All pieces" || x.category === p.category) &&
        (!q || x.name.toLowerCase().includes(q)) &&
        (!inStock || !isSoldOut(x)) &&
        (!sizeFilter || x.stock[sizeFilter] > 0) &&
        (!p.favouritesOnly || p.likes.includes(x.id)),
    );
    const by: Record<Sort, (a: Product, b: Product) => number> = {
      featured: () => 0,
      "price-low": (a, b) => a.price - b.price,
      "price-high": (a, b) => b.price - a.price,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return list.sort(by[sort]);
  }, [p.products, p.category, p.query, p.favouritesOnly, p.likes, inStock, sizeFilter, sort]);

  const resetAll = () => {
    setInStock(false);
    setSizeFilter("");
    p.onResetAll();
  };

  return (
    <section className="collection shopping-collection" id="collection">
      <div className="collection-heading shopping-heading">
        <div>
          <div className="eyebrow">THE BERRY’S COLLECTION</div>
          <h2>
            {p.favouritesOnly
              ? "Your favourites"
              : p.query
                ? `Results for “${p.query}”`
                : p.category === "All pieces"
                  ? "Discover the collection"
                  : p.category}
          </h2>
        </div>
        <p>
          {p.favouritesOnly
            ? "Saved for their next adventure."
            : p.query
              ? `${visible.length} matching pieces`
              : "Everyday favourites, all in one place."}
        </p>
      </div>

      <div className="category-tabs">
        {categories.map((c) => (
          <button key={c} className={p.category === c ? "active" : ""} onClick={() => p.onCategory(c)}>
            {c}
            {c === "All pieces" && <span>{p.products.length}</span>}
          </button>
        ))}
      </div>

      <div className="collection-tools">
        <div>
          <button
            className={"filter-toggle " + (filtersOpen ? "selected" : "")}
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <SlidersHorizontal size={16} /> Filters{" "}
            {(inStock || sizeFilter) && <span className="filter-dot" />}
          </button>
          <span className="piece-count">
            {visible.length} lovely pieces{p.favouritesOnly ? " saved" : ""}
          </span>
        </div>
        <label>
          Sort by:{" "}
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort products">
            <option value="featured">Featured</option>
            <option value="price-low">Price: low to high</option>
            <option value="price-high">Price: high to low</option>
            <option value="name">Name: A to Z</option>
          </select>
          <ChevronDown size={14} />
        </label>
      </div>

      {filtersOpen && (
        <div className="filters-panel">
          <label>
            <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} />{" "}
            In-stock pieces only
          </label>
          <label>
            Size{" "}
            <select value={sizeFilter} onChange={(e) => setSizeFilter(e.target.value)}>
              <option value="">All sizes</option>
              {sizes.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <button onClick={resetAll}>Clear filters</button>
        </div>
      )}

      {p.error && (
        <div className="error-banner">
          <AlertCircle size={16} />
          {p.error} <button onClick={p.onRetry}>Retry</button>
        </div>
      )}

      <div className="product-grid">
        {visible.map((product, i) => (
          <ProductCard
            key={product.id}
            product={product}
            liked={p.likes.includes(product.id)}
            eager={i < 4}
            onChoose={p.onChoose}
          />
        ))}
      </div>

      {!visible.length && (
        <div className="empty-state">
          <Search size={36} />
          <h3>No little favourites here yet.</h3>
          <p>Try another category or clear your filters.</p>
          <button className="primary" onClick={resetAll}>
            See all pieces <ArrowRight size={17} />
          </button>
        </div>
      )}

      <div className="collection-end">
        <span /> <span>A little something for every little someone.</span> <span />
      </div>
    </section>
  );
}

function ProductCard({
  product: p,
  liked,
  eager,
  onChoose,
}: {
  product: Product;
  liked: boolean;
  eager: boolean;
  onChoose: (product: Product, size?: string) => void;
}) {
  const soldOut = isSoldOut(p);
  const off = discountPercent(p);
  return (
    <article className="product-card">
      <div className="product-image">
        <button className="product-link" onClick={() => onChoose(p)} aria-label={"View " + p.name}>
          <img src={p.image} alt={p.name} loading={eager ? "eager" : "lazy"} />
        </button>
        {(soldOut || p.badge) && (
          <span className={"product-badge " + (soldOut ? "sold" : "")}>{soldOut ? "SOLD OUT" : p.badge}</span>
        )}
        <IconButton
          className={"heart-btn " + (liked ? "liked" : "")}
          label={liked ? "Remove from favourites" : "Save to favourites"}
          onClick={() => toggleLike(p.id)}
        >
          <Heart size={17} fill={liked ? "currentColor" : "none"} />
        </IconButton>
        <button className="quick-add" onClick={() => onChoose(p)}>
          {soldOut ? "View details" : "Quick add"}
          <Plus size={17} />
        </button>
      </div>
      <div className="product-category">
        {p.category}
        <span style={{ background: p.color }} />
      </div>
      <button className="product-title" onClick={() => onChoose(p)}>
        {p.name}
      </button>
      <div className="price">
        {money(p.price)}
        {off > 0 && (
          <>
            {" "}
            <del>{money(p.originalPrice)}</del>
            <span>{off}% off</span>
          </>
        )}
      </div>
      <div className="card-sizes">
        {sizes.map((s) => (
          <button
            key={s}
            className={!p.stock[s] ? "unavailable" : ""}
            title={p.stock[s] ? `${s}: ${p.stock[s]} available` : `${s}: Sold out`}
            onClick={() => onChoose(p, p.stock[s] > 0 ? s : undefined)}
          >
            {s}
          </button>
        ))}
      </div>
    </article>
  );
}
