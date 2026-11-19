import type { Instrumentation } from "next";

export function register() {}

/**
 * Every unexpected server error (pages, API routes, server actions) is saved
 * to the error log in Settings → Developer. 404s and redirects are not errors.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const digest = typeof err === "object" && err && "digest" in err ? String(err.digest) : "";
  if (/^NEXT_(HTTP_ERROR_FALLBACK|REDIRECT|NOT_FOUND)/.test(digest)) return;
  const { logError } = await import("./lib/error-log");
  const path = request.path.split("?")[0];
  const source = /^\/api\/(checkout|webhooks)/.test(path) ? "payment" : "server";
  await logError(source, err, { path: `${request.method} ${path}`, ref: context.routeType });
};
