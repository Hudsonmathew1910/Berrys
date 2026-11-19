"use client";
import Link from "next/link";
import { Heart, Loader2 } from "lucide-react";
import { useLikes } from "@/components/store/bag";
import { ProductCard } from "./product-card";
import { useProducts } from "./use-products";

/** Saved favourites (stored in this browser). */
export function FavouritesView() {
  const likes = useLikes();
  const { products, loading } = useProducts(likes);
  const shown = likes.map((id) => products.find((p) => p.id === id)).filter((p) => !!p);

  if (!likes.length) {
    return (
      <div className="empty-state">
        <Heart size={36} />
        <h3>No favourites yet.</h3>
        <p>Tap the heart on any piece to save it here.</p>
        <Link className="primary" href="/shop">
          Browse the collection
        </Link>
      </div>
    );
  }
  if (loading) {
    return (
      <p className="muted">
        <Loader2 className="spin" size={16} /> Loading your favourites…
      </p>
    );
  }
  return (
    <div className="product-grid compact">
      {shown.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
