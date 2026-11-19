/** Shared store types, constants and helpers (safe for client and server). */

/** Size range for new categories unless changed in the dashboard. */
export const DEFAULT_SIZES = ["S", "M", "L", "XL"];
export const MAX_IMAGES = 6;

export type Category = {
  id: string;
  name: string;
  description: string;
  image: string;
  sizes: string[];
  sortOrder: number;
  active: boolean;
};

export type Product = {
  id: string;
  name: string;
  category: string;
  gender: "girls" | "boys" | "unisex";
  tags: string[];
  /** Price the customer pays now (after any active offer). */
  price: number;
  /** Price before offers (set in the dashboard). */
  basePrice: number;
  /** "Was" / MRP price, shown struck through. */
  originalPrice: number;
  /** Name of the offer currently applied, if any. */
  offer: string;
  description: string;
  image: string;
  images: string[];
  badge: string;
  color: string;
  /** This product's category sizes, in display order. */
  sizes: string[];
  stock: Record<string, number>;
};

export type BagLine = { productId: string; size: string; quantity: number };

export const money = (n: number) => "₹" + n.toLocaleString("en-IN");

export const isSoldOut = (p: Pick<Product, "stock">) => Object.values(p.stock).every((n) => !n);

export const discountPercent = (p: Pick<Product, "price" | "originalPrice">) =>
  p.originalPrice > p.price ? Math.round((1 - p.price / p.originalPrice) * 100) : 0;

export const genderLabels: Record<Product["gender"], string> = {
  girls: "Girls",
  boys: "Boys",
  unisex: "Unisex",
};

/**
 * Shipping rule, applied on the server when the order is created and shown in
 * the bag. Set in Dashboard → Settings (passed in); 0 = free shipping.
 */
export function shippingFor(subtotal: number, rule: { fee: number; freeAbove: number }) {
  if (!rule.fee) return 0;
  if (rule.freeAbove && subtotal >= rule.freeAbove) return 0;
  return rule.fee;
}
