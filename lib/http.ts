import "server-only";
import { ZodError } from "zod";
import { HttpError } from "@/lib/http-error";

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** The site origin(s) this request may come from (its own host, plus SITE_URL). */
function allowedOrigins(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const list = new Set([url.origin, `${proto}://${host}`]);
  if (process.env.SITE_URL) list.add(new URL(process.env.SITE_URL).origin);
  return list;
}

/**
 * CSRF protection for cookie-authenticated mutations: the request must
 * provably come from this site — matching Origin, or Sec-Fetch-Site
 * same-origin, or (older browsers) a same-site Referer. Requests that prove
 * nothing are rejected; every browser sends Origin on POST/PUT/PATCH/DELETE.
 */
export function assertSameOrigin(request: Request) {
  const allowed = allowedOrigins(request);
  const origin = request.headers.get("origin");
  if (origin) {
    if (allowed.has(origin)) return;
    throw new HttpError(403, "Invalid request origin.");
  }
  const site = request.headers.get("sec-fetch-site");
  if (site) {
    if (site === "same-origin") return;
    throw new HttpError(403, "Invalid request origin.");
  }
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      if (allowed.has(new URL(referer).origin)) return;
    } catch {
      // fall through
    }
  }
  throw new HttpError(403, "Invalid request origin.");
}

/** Turns thrown errors into JSON responses without leaking internals. */
export function handleError(e: unknown, fallback = "Something went wrong. Please try again.") {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  if (e instanceof ZodError) {
    return json({ error: e.issues[0]?.message || "Please check the details you entered." }, 400);
  }
  console.error(e);
  return json({ error: fallback }, 500);
}
