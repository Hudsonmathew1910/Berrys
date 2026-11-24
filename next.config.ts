import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Security headers for every response. The page Content-Security-Policy is
 * set per request in proxy.ts (it needs a fresh script nonce each time).
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      'camera=(), microphone=(), geolocation=(), usb=(), interest-cohort=(), payment=(self "https://checkout.razorpay.com" "https://api.razorpay.com")',
  },
  // Razorpay and Google login open popups that must be able to talk back.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  // Don't advertise the framework in response headers.
  poweredByHeader: false,
  // Never ship readable source maps of the browser code in production.
  productionBrowserSourceMaps: false,
  reactStrictMode: true,
  // postgres.js uses Node APIs; keep it out of the server bundle.
  serverExternalPackages: ["postgres", "sharp"],
  experimental: {
    // Dashboard photo uploads go through the API route, not server actions.
    serverActions: { bodySizeLimit: "1mb" },
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // No site page may be shown inside a frame (clickjacking) — except the home page template,
      // which the dashboard's Website content preview shows in a frame on this same site.
      { source: "/((?!content-preview$).*)", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
      { source: "/content-preview", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] },
      {
        // API responses: never cached by shared caches, never rendered as a page.
        source: "/api/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" },
        ],
      },
      {
        // Bundled images and icons rarely change: let browsers and the CDN cache them.
        source: "/:file(images/.*|favicon.png|apple-touch-icon.png)",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
    ];
  },
};

export default nextConfig;
