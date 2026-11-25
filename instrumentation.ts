import type { Instrumentation } from "next";

export function register() {}

/**
 * The visitor closed the tab, reloaded or clicked away while the page was
 * still streaming. Nothing went wrong on our side, so it isn't logged.
 */
function visitorLeft(err: unknown) {
  if (typeof err !== "object" || !err) return false;
  const { message = "", code = "" } = err as { message?: string; code?: string };
  return (
    /destination stream errored while writing|premature close|^aborted$/i.test(message) ||
    code === "ECONNRESET" ||
    code === "ERR_STREAM_PREMATURE_CLOSE"
  );
}

/**
 * Every unexpected server error (pages, API routes, server actions) is saved
 * to the error log in Settings → Developer. 404s, redirects and visitors who
 * leave a page before it finished loading are not errors.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const digest = typeof err === "object" && err && "digest" in err ? String(err.digest) : "";
  if (/^NEXT_(HTTP_ERROR_FALLBACK|REDIRECT|NOT_FOUND)/.test(digest)) return;
  if (visitorLeft(err)) return;
  const { logError } = await import("./lib/error-log");
  const path = request.path.split("?")[0];
  const source = /^\/api\/(checkout|webhooks)/.test(path) ? "payment" : "server";
  await logError(source, err, { path: `${request.method} ${path}`, ref: context.routeType });
};
