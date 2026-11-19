/** Shared store types, constants and helpers (safe for client and server). */

export const sizes = ["S", "M", "L", "XL"] as const;
export type Size = (typeof sizes)[number];

export const categories = [
  "All pieces",
  "Co-ord sets",
  "Tops & tees",
  "Trousers",
  "Dresses",
  "Sleepwear",
] as const;
/** Categories a product can belong to (everything except the "All" filter). */
export const productCategories = categories.slice(1) as readonly string[];

export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  originalPrice: number;
  description: string;
  image: string;
  badge: string;
  color: string;
  stock: Record<string, number>;
};

export type BagLine = { productId: string; size: string; quantity: number };

export const money = (n: number) => "₹" + n.toLocaleString("en-IN");

export const isSoldOut = (p: Product) => Object.values(p.stock).every((n) => !n);

export const discountPercent = (p: Product) =>
  p.originalPrice > p.price ? Math.round((1 - p.price / p.originalPrice) * 100) : 0;

/**
 * Shipping rule, applied on the server when the order is created and shown in
 * the bag. Defaults to free shipping; set the env vars to charge a flat fee.
 */
export const shippingConfig = {
  fee: Number(process.env.NEXT_PUBLIC_SHIPPING_FEE || 0),
  freeAbove: Number(process.env.NEXT_PUBLIC_FREE_SHIPPING_ABOVE || 0),
};
export function shippingFor(subtotal: number) {
  if (!shippingConfig.fee) return 0;
  if (shippingConfig.freeAbove && subtotal >= shippingConfig.freeAbove) return 0;
  return shippingConfig.fee;
}

export const emptyProduct: Product = {
  id: "",
  name: "",
  category: "Co-ord sets",
  price: 699,
  originalPrice: 899,
  description: "",
  image: "",
  badge: "",
  color: "#bd9460",
  stock: { S: 0, M: 0, L: 0, XL: 0 },
};

/**
 * Sample catalogue loaded once by the owner-setup step.
 * PLACEHOLDER: names, prices and copy must be replaced, and the photos in
 * public/images/product-*.webp were taken from another store's site — they
 * must be replaced with Berry's own photography before launch.
 */
const seed: [name: string, category: string, price: number, was: number, color: string][] = [
  ["Peach days co-ord set", "Co-ord sets", 699, 899, "#dba58d"],
  ["Bonjour cotton co-ord", "Co-ord sets", 749, 999, "#9d7b62"],
  ["Hakuna relaxed set", "Co-ord sets", 649, 849, "#a4ad8a"],
  ["Little explorer co-ord", "Co-ord sets", 799, 999, "#a88969"],
  ["Meadow cotton dress", "Dresses", 899, 1199, "#e0d9c6"],
  ["Rust handloom set", "Co-ord sets", 849, 1099, "#824d42"],
  ["Dino day shorts set", "Tops & tees", 599, 799, "#99ab82"],
  ["Giraffe dreams pyjamas", "Sleepwear", 699, 899, "#9a806c"],
  ["Midnight floral dress", "Dresses", 849, 1099, "#393936"],
  ["Penguin play set", "Tops & tees", 599, 799, "#a1b5c0"],
  ["Sunshine oversized set", "Trousers", 749, 999, "#d3bb72"],
  ["Pink roadtrip pyjamas", "Sleepwear", 699, 899, "#cf9fa8"],
];

export const seedProducts: Product[] = seed.map(([name, category, price, originalPrice, color], i) => ({
  id: `berry-${i + 1}`,
  name,
  category,
  price,
  originalPrice,
  color,
  description:
    "An easy-going favourite for play-filled days. A soft cotton feel, a relaxed fit, and all the room they need to be themselves. Sample collection — replace with your product specifications before launch.",
  image: `/images/product-${i + 1}.webp`,
  badge: i === 0 ? "NEW ARRIVAL" : i === 1 ? "LITTLE FAVOURITE" : i === 4 ? "JUST IN" : "",
  stock:
    i === 3
      ? { S: 0, M: 5, L: 10, XL: 4 }
      : i === 8
        ? { S: 0, M: 0, L: 0, XL: 0 }
        : { S: 3, M: 5, L: 10, XL: 4 },
}));
