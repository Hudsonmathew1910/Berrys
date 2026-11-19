import "server-only";
import { z } from "zod";
import { getStoredValue, saveContent } from "@/lib/content";

/**
 * Store settings edited in Dashboard → Settings (admins and developers).
 * Stored as one JSON row in site_content (key "settings"), so they share the
 * site-content cache and are refreshed the moment they are saved.
 */
export const SETTINGS_KEY = "settings";

const url = z
  .string()
  .trim()
  .max(300)
  .refine((v) => !v || /^https:\/\/[^\s"'<>]+$/.test(v), "Links must start with https://");
const text = (max: number) => z.string().trim().max(max);
const money = z.coerce.number().int().min(0).max(100000);

export const settingsSchema = z.object({
  // Store details
  siteName: text(40).min(1, "Enter the website name."),
  tagline: text(80),
  supportEmail: z
    .string()
    .trim()
    .max(120)
    .refine((v) => !v || z.email().safeParse(v).success, "Enter a valid support email."),
  supportPhone: text(20),
  whatsapp: text(20),
  storeAddress: text(300),
  /** Uploaded logo mark (square). Empty = the built-in Berry's mark. */
  logoUrl: text(500),

  // Social links
  instagram: url,
  facebook: url,
  youtube: url,
  x: url,
  pinterest: url,

  // SEO
  seoTitle: text(70),
  seoDescription: text(170),
  seoKeywords: text(200),
  seoImage: text(500),

  // Shipping & returns
  shippingFee: money,
  freeShippingAbove: money,
  /** Days after delivery a customer may ask for a return/refund. */
  returnDays: z.coerce.number().int().min(0).max(90),

  // Emails
  emailOrderStatus: z.boolean(),
  emailLoginAlert: z.boolean(),
  emailTeamNewOrder: z.boolean(),
  /** "Forgot password?" on the dashboard sends a one-time code to the person's Gmail. */
  dashboardPasswordReset: z.boolean(),

  // Payments: Razorpay on, or (when an admin turns it off) demo payments for everyone.
  paymentMode: z.preprocess((v) => (v === "off" ? "demo" : v), z.enum(["razorpay", "demo"])),

  // Maintenance
  maintenance: z.boolean(),
  maintenanceMessage: text(300),

  // Developer
  errorLogDays: z.coerce.number().int().min(1).max(365),
});
export type Settings = z.infer<typeof settingsSchema>;

export const settingsDefaults: Settings = {
  siteName: "Berry’s",
  tagline: "Made for little adventures",
  supportEmail: "",
  supportPhone: "",
  whatsapp: "",
  storeAddress: "",
  logoUrl: "",
  instagram: "",
  facebook: "",
  youtube: "",
  x: "",
  pinterest: "",
  seoTitle: "Berry’s — Made for little adventures",
  seoDescription:
    "Thoughtfully chosen clothing for everyday adventures. Discover comfortable co-ords, playful essentials and little favourites at Berry’s.",
  seoKeywords: "kids clothing, co-ord sets, kids dresses, pyjamas, children's wear India",
  seoImage: "",
  shippingFee: Number(process.env.NEXT_PUBLIC_SHIPPING_FEE || 0),
  freeShippingAbove: Number(process.env.NEXT_PUBLIC_FREE_SHIPPING_ABOVE || 0),
  returnDays: 7,
  emailOrderStatus: true,
  emailLoginAlert: false,
  emailTeamNewOrder: true,
  dashboardPasswordReset: true,
  paymentMode: "razorpay",
  maintenance: false,
  maintenanceMessage: "We’re making a few little improvements. Please check back shortly.",
  errorLogDays: 30,
};

/** Current settings, with defaults for anything never saved (cached; cheap to call). */
export async function getSettings(): Promise<Settings> {
  const saved = (await getStoredValue(SETTINGS_KEY)) ?? {};
  const merged = { ...settingsDefaults, ...saved };
  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : settingsDefaults;
}

/** Merges a partial change into the saved settings and validates the result. */
export async function updateSettings(change: Partial<Settings>, by: string) {
  const next = settingsSchema.parse({ ...(await getSettings()), ...change });
  await saveContent(SETTINGS_KEY, next, by);
  return next;
}

/** Shipping rule passed to the bag and checkout (same rule the server charges). */
export type ShippingRule = { fee: number; freeAbove: number };
export const shippingRule = (s: Settings): ShippingRule => ({
  fee: s.shippingFee,
  freeAbove: s.freeShippingAbove,
});
