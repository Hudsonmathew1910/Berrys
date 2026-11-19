"use client";
import Link from "next/link";
import { Heart } from "lucide-react";
import { discountPercent, isSoldOut, money, type Product } from "@/lib/catalog";
import { toggleLike, useLikes } from "@/components/store/bag";

/** Product tile used on the home page, shop listing, favourites and "you may also like". */
export function ProductCard({ product: p, eager = false }: { product: Product; eager?: boolean }) {
  const likes = useLikes();
  const liked = likes.includes(p.id);
  const soldOut = isSoldOut(p);
  const off = discountPercent(p);
  const href = `/products/${encodeURIComponent(p.id)}`;

  return (
    <article className="product-card">
      <div className="product-image">
        <Link className="product-link" href={href} aria-label={"View " + p.name}>
          <img src={p.image} alt={p.name} loading={eager ? "eager" : "lazy"} />
        </Link>
        {(soldOut || p.badge || p.offer) && (
          <span className={"product-badge " + (soldOut ? "sold" : "")}>
            {soldOut ? "SOLD OUT" : p.offer ? "SALE" : p.badge}
          </span>
        )}
        <button
          type="button"
          className={"icon-btn heart-btn " + (liked ? "liked" : "")}
          aria-label={liked ? "Remove from favourites" : "Save to favourites"}
          aria-pressed={liked}
          onClick={() => toggleLike(p.id)}
        >
          <Heart size={17} fill={liked ? "currentColor" : "none"} />
        </button>
        <Link className="quick-add" href={href}>
          {soldOut ? "View details" : "Choose size"}
        </Link>
      </div>
      <div className="product-category">
        {p.category}
        <span style={{ background: p.color }} />
      </div>
      <Link className="product-title" href={href}>
        {p.name}
      </Link>
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
      <div className="card-sizes" aria-label="Sizes">
        {p.sizes.map((s) => (
          <span
            key={s}
            className={!p.stock[s] ? "unavailable" : ""}
            title={p.stock[s] ? s : `${s}: sold out`}
          >
            {s}
          </span>
        ))}
      </div>
    </article>
  );
}
