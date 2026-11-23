"use client";
import type { BagLine, Product } from "@/lib/catalog";
import { createPersistedStore } from "./persisted-store";

const EMPTY_BAG: BagLine[] = [];
const EMPTY_LIKES: string[] = [];

export const bagStore = createPersistedStore<BagLine[]>("berry-bag", EMPTY_BAG);
export const likesStore = createPersistedStore<string[]>("berry-likes", EMPTY_LIKES);

export const useBag = bagStore.use;
export const useLikes = likesStore.use;

export function toggleLike(id: string) {
  likesStore.set((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
}

/** Adds to the bag. Returns an error message if it would exceed stock. */
export function addToBag(bag: BagLine[], product: Product, size: string, quantity: number) {
  const existing = bag.find((x) => x.productId === product.id && x.size === size)?.quantity || 0;
  if (existing + quantity > (product.stock[size] ?? 0)) {
    return "You have reached the available stock for this size.";
  }
  bagStore.set((old) => {
    const i = old.findIndex((x) => x.productId === product.id && x.size === size);
    return i < 0
      ? [...old, { productId: product.id, size, quantity }]
      : old.map((x, j) => (j === i ? { ...x, quantity: x.quantity + quantity } : x));
  });
  return null;
}

export function bagTotals(bag: BagLine[], products: Product[]) {
  return {
    /** Taken off by offers (already included in subtotal). */
    saved: bag.reduce((a, x) => {
      const p = products.find((y) => y.id === x.productId);
      return a + (p ? Math.max(0, p.basePrice - p.price) * x.quantity : 0);
    }, 0),
    count: bag.reduce((a, x) => a + x.quantity, 0),
    subtotal: bag.reduce(
      (a, x) => a + (products.find((p) => p.id === x.productId)?.price || 0) * x.quantity,
      0,
    ),
  };
}
