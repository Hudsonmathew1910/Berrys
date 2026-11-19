import "server-only";
import { ZodError } from "zod";
import { HttpError } from "@/lib/http-error";

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Rejects cross-site form posts for cookie-authenticated mutations. */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new HttpError(403, "Invalid request origin.");
  }
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
