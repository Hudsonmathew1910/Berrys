/**
 * Central place for environment variables, so a missing value fails with a
 * clear message instead of an obscure runtime error. See .env.example.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name}. Add it to .env (see .env.example).`);
  }
  return value;
}

/** Server-only settings and secrets. Never import values from here into client components. */
export const serverEnv = {
  /** Public base URL of the site, e.g. https://berrys.in (no trailing slash). */
  siteUrl: () =>
    (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""),

  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  databaseUrl: () => required("DATABASE_URL", process.env.DATABASE_URL),

  googleClientId: () => required("GOOGLE_CLIENT_ID", process.env.GOOGLE_CLIENT_ID),
  googleClientSecret: () => required("GOOGLE_CLIENT_SECRET", process.env.GOOGLE_CLIENT_SECRET),
  googleConfigured: () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),

  razorpayKeyId: () => required("RAZORPAY_KEY_ID", process.env.RAZORPAY_KEY_ID),
  razorpayKeySecret: () => required("RAZORPAY_KEY_SECRET", process.env.RAZORPAY_KEY_SECRET),
  razorpayWebhookSecret: () => required("RAZORPAY_WEBHOOK_SECRET", process.env.RAZORPAY_WEBHOOK_SECRET),

  storeOwnerEmail: () => process.env.STORE_OWNER_EMAIL?.trim().toLowerCase() || "",

  /** Optional: order confirmation emails are skipped when unset. */
  resendApiKey: () => process.env.RESEND_API_KEY || "",
  orderEmailFrom: () => process.env.ORDER_EMAIL_FROM || "Berry’s <orders@example.com>",
};
