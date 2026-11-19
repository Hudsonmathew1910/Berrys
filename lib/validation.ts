import { z } from "zod";
import { productCategories, sizes } from "@/lib/catalog";

const sizeSchema = z.enum(sizes);

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

export const productSchema = z
  .object({
    id: z.string().max(100).optional().default(""),
    name: z.string().trim().min(2, "Product name is too short.").max(100),
    category: z.string().refine((c) => productCategories.includes(c), "Choose a valid category."),
    price: z.number().int().min(1).max(1_000_000),
    originalPrice: z.number().int().min(1).max(1_000_000),
    description: z.string().max(3000).default(""),
    image: z.string().refine(isAllowedImageUrl, "Upload a product photo."),
    badge: z.string().max(40).default(""),
    color: z.string().regex(/^#[a-f0-9]{6}$/i, "Choose a colour swatch."),
    stock: z.object(
      Object.fromEntries(sizes.map((s) => [s, z.number().int().min(0).max(100_000)])) as Record<
        (typeof sizes)[number],
        z.ZodNumber
      >,
    ),
  })
  .refine((p) => p.originalPrice >= p.price, "Original price must be at least the selling price.");
export type ProductInput = z.infer<typeof productSchema>;
