import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request Content-Security-Policy with a script nonce.
 *
 * Only scripts carrying this request's random nonce (Next.js adds it to its
 * own scripts automatically) — and scripts those load ('strict-dynamic', e.g.
 * Razorpay Checkout, Google reCAPTCHA) — may run. An injected <script> or
 * inline event handler is blocked even if some text slipped through escaping.
 */
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const isDev = process.env.NODE_ENV !== "production";
  const supabase = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").origin;
    } catch {
      return "https://*.supabase.co";
    }
  })();

  const csp = [
    "default-src 'self'",
    // https: is only a fallback for very old browsers; modern ones use nonce + strict-dynamic.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are used for charts and colour swatches.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `img-src 'self' data: blob: ${supabase} https://lh3.googleusercontent.com https://*.razorpay.com`,
    `connect-src 'self' https://*.razorpay.com${isDev ? " ws: wss:" : ""}`,
    // 'self': the dashboard shows the home page template in a frame (Website content → Preview).
    "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://*.razorpay.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    // Only the dashboard's home page template may be framed, and only by this site.
    request.nextUrl.pathname === "/content-preview" ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "object-src 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Lets the dashboard layout check access before anything streams (so blocked pages are a real 404).
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not API routes, static files, images or link prefetches.
      source: "/((?!api/|_next/static|_next/image|images/|favicon|apple-touch-icon|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
