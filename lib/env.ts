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
    (
      process.env.SITE_URL ||
      // Vercel sets this automatically to the project's production domain.
      (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000"
    ).replace(/\/$/, ""),

  /**
   * Base URL for links inside emails. EMAIL_SITE_URL (e.g. https://berrystores.in)
   * lets emails sent while developing on localhost still link to the live site:
   * spam filters distrust localhost / plain-http links. Defaults to siteUrl().
   */
  emailSiteUrl: () => (process.env.EMAIL_SITE_URL?.trim() || serverEnv.siteUrl()).replace(/\/$/, ""),

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

  /** Optional Gmail (or any) SMTP for order emails. SMTP_PASS is a Google "App password", not the login password. */
  smtp: () => {
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.replace(/\s+/g, "");
    if (!user || !pass) return null;
    return {
      user,
      pass,
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT) || 465,
    };
  },

  /** Optional: order confirmation emails are skipped when unset. */
  resendApiKey: () => process.env.RESEND_API_KEY || "",
  /** Optional Brevo (brevo.com) API key: sends from ORDER_EMAIL_FROM, like Resend. */
  brevoApiKey: () => process.env.BREVO_API_KEY?.trim() || "",
  orderEmailFrom: () => process.env.ORDER_EMAIL_FROM || "Berry’s <orders@example.com>",
};
