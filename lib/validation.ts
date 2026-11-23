import { z } from "zod";
/** Size labels are defined per category (e.g. "M" or "2-3Y"). */
const sizeSchema = z.string().trim().min(1).max(20);

export const bagSchema = z
  .array(
    z.object({
      productId: z.string().min(1).max(100),
      size: sizeSchema,
      quantity: z.number().int().min(1).max(100),
    }),
  )
  .min(1, "Your bag is empty.")
  .max(30, "Your bag has too many lines.");

export const checkoutSchema = z.object({
  items: bagSchema,
  customer: z.string().trim().min(2, "Please enter your name.").max(100),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address."),
  phone: z
    .string()
    .trim()
    .transform((s) => s.replace(/[\s-]/g, "").replace(/^(\+91|0)/, ""))
    .pipe(z.string().regex(/^[6-9]\d{9}$/, "Please enter a valid 10-digit mobile number.")),
  address: z.string().trim().min(10, "Please enter your complete address.").max(1000),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/, "Please enter a valid 6-digit PIN code."),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const verifyPaymentSchema = z.object({
  orderId: z.string().min(1).max(40),
  razorpay_order_id: z.string().min(1).max(100),
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_signature: z.string().min(1).max(200),
});

export const cancelPaymentSchema = z.object({
  orderId: z.string().min(1).max(40),
  razorpayOrderId: z.string().min(1).max(100),
});

/** Images must be bundled sample assets or files in this project's Supabase bucket. */
export function isAllowedImageUrl(url: string) {
  if (url.startsWith("/images/")) return true;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !!base && url.startsWith(`${base}/storage/v1/object/public/product-images/`);
}

/** Product as edited in the dashboard. Sizes come from the chosen category. */
export const productSchema = z
  .object({
    id: z.string().max(100).optional().default(""),
    name: z.string().trim().min(2, "Product name is too short.").max(100),
    category: z.string().trim().min(1, "Choose a category.").max(80),
    gender: z.enum(["girls", "boys", "unisex"]),
    tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(20).default([]),
    /** MRP — the normal price. */
    price: z.number().int().min(1, "Enter the MRP.").max(1_000_000),
    /**
     * Optional sale price (below the MRP) with optional start/end (India time, yyyy-MM-ddTHH:mm).
     * Saved as the product's own offer; 0 / missing = no sale price.
     */
    salePrice: z.number().int().min(0).max(1_000_000).optional().default(0),
    saleStartsAt: z.string().max(20).optional().default(""),
    saleEndsAt: z.string().max(20).optional().default(""),
    description: z.string().max(5000).default(""),
    images: z
      .array(z.string().refine(isAllowedImageUrl, "Invalid image."))
      .min(1, "Add at least one photo.")
      .max(6, "Up to 6 photos."),
    badge: z.string().trim().max(40).default(""),
    color: z.string().regex(/^#[a-f0-9]{6}$/i, "Choose a colour swatch."),
    active: z.boolean().default(true),
    stock: z.record(z.string().min(1).max(20), z.number().int().min(0).max(100_000)),
    /** Stock shown when the editor was opened: only the difference is applied, so sales made meanwhile aren’t lost. */
    stockBase: z.record(z.string().min(1).max(20), z.number().int().min(0).max(100_000)).optional(),
    /** updatedAt when the editor was opened: rejects saving over someone else’s newer edit. */
    version: z.string().max(40).optional(),
  })
  .refine((p) => !p.salePrice || p.salePrice < p.price, "The sale price must be lower than the MRP.");
export type ProductInput = z.infer<typeof productSchema>;

export const indianStates = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

const mobile = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s-]/g, "").replace(/^(\+91|0)/, ""))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, "Please enter a valid 10-digit mobile number."));

/** A delivery address (saved to the account, or typed at checkout). */
export const addressSchema = z.object({
  name: z.string().trim().min(2, "Please enter the recipient’s name.").max(100),
  phone: mobile,
  line1: z.string().trim().min(5, "Please enter the house / street.").max(200),
  line2: z.string().trim().max(200).default(""),
  city: z.string().trim().min(2, "Please enter the city.").max(80),
  state: z.enum(indianStates, { message: "Please choose a state." }),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/, "Please enter a valid 6-digit PIN code."),
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.infer<typeof addressSchema>;
