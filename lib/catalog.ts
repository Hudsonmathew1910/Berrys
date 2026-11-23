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
  /** When today's offer price ends (ISO time), or null when it has no end / there's no offer. */
  offerEndsAt: string | null;
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

/** "yyyy-MM-ddTHH:mm" in India time (datetime-local inputs) → Date. Empty → null; bad input → Invalid Date. */
export function fromIndiaInput(v: string): Date | null {
  if (!v) return null;
  return new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? `${v}:00+05:30` : "invalid");
}

/** Date → "yyyy-MM-ddTHH:mm" in India time, for datetime-local inputs. */
export const toIndiaInput = (d: Date | null | undefined) =>
  d ? new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 16) : "";

/**
 * One offer applied to a starting price, never below ₹1. Shared by the shop, checkout and the
 * dashboard previews so they always agree. percent = % off, flat = ₹ off, price = pay exactly `value`.
 */
export function applyOffer(o: { type: "percent" | "flat" | "price"; value: number }, from: number) {
  const next =
    o.type === "price"
      ? Math.min(from, o.value)
      : o.type === "percent"
        ? from - Math.round((from * Math.min(o.value, 90)) / 100)
        : from - o.value;
  return Math.max(1, next);
}

/** "Offer ends 24 Nov, 10:13 pm" (India time) — or "Offer ends today, 10:13 pm". */
export function offerEndsText(iso: string | null, now = new Date()) {
  if (!iso) return "";
  const end = new Date(iso);
  const day = (d: Date) => d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
  const time = end.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
  });
  const tomorrow = new Date(now.getTime() + 86_400_000);
  const when =
    day(end) === day(now)
      ? `today, ${time}`
      : day(end) === day(tomorrow)
        ? `tomorrow, ${time}`
        : `${end.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}, ${time}`;
  return `Offer ends ${when}`;
}
