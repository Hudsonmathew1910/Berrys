import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Only this project's Supabase is allowed (falls back to any *.supabase.co).
const supabase = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").origin;
  } catch {
    return "https://*.supabase.co";
  }
})();

/**
 * Content-Security-Policy: the browser refuses scripts, frames and network
 * calls to anywhere not listed here, which blunts XSS and card-skimming
 * injections. Razorpay Checkout needs its script, iframes and API.
 * 'unsafe-inline' is needed for Next.js' inline bootstrap scripts.
 */
const csp = [
  "default-src 'self'",
  // Razorpay Checkout; Google reCAPTCHA for Firebase mobile OTP.
  `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://*.razorpay.com https://www.google.com https://www.gstatic.com https://apis.google.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // Product photos (Supabase Storage) and Google profile pictures.
  `img-src 'self' data: blob: ${supabase} https://*.razorpay.com https://lh3.googleusercontent.com https://www.gstatic.com`,
  // This site, Razorpay, and Firebase Auth (sends/checks the SMS code).
  `connect-src 'self' https://*.razorpay.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.google.com${isDev ? " ws: wss:" : ""}`,
  "frame-src https://api.razorpay.com https://checkout.razorpay.com https://*.razorpay.com https://www.google.com https://recaptcha.google.com https://*.firebaseapp.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value:
      'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com" "https://api.razorpay.com")',
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  // Don't advertise the framework in response headers.
  poweredByHeader: false,
  // postgres.js uses Node APIs; keep it out of the server bundle.
  serverExternalPackages: ["postgres"],
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // Never cache API responses in shared caches.
      { source: "/api/(.*)", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
