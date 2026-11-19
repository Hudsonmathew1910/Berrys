import "server-only";
import { count, desc, eq, gt, lt, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { ErrorSource } from "@/db/schema";

const { errorLogs } = schema;
export const ERROR_PAGE_SIZE = 30;

/** Removes anything that looks like a secret before an error is stored. */
function scrub(s: string) {
  return s
    .replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi, "$1***@")
    .replace(/\b(sk|rzp|re|GOCSPX|sb_secret)[-_][A-Za-z0-9_-]{6,}/g, "$1_***")
    .replace(/(authorization|password|secret|token|api[_-]?key)(["'\s:=]+)[^\s"',}]+/gi, "$1$2***");
}

/**
 * Records an error for Settings → Developer → Error log. Never throws (a
 * broken logger must not break checkout), and always also prints to the
 * server console so it shows in Vercel's logs.
 */
export async function logError(
  source: ErrorSource,
  error: unknown,
  info: { path?: string; ref?: string; message?: string } = {},
) {
  const err = error instanceof Error ? error : null;
  const base = info.message ?? err?.message ?? String(error);
  const digest =
    typeof error === "object" && error && "digest" in error ? ` (digest ${String(error.digest)})` : "";
  const message = scrub(base + digest).slice(0, 500);
  console.error(`[${source}]`, info.path ?? "", message, err?.stack ?? "");
  try {
    await getDb()
      .insert(errorLogs)
      .values({
        source,
        message,
        detail: scrub(err?.stack ?? (info.message && err ? err.message : "")).slice(0, 4000),
        path: (info.path ?? "").slice(0, 300),
        ref: (info.ref ?? "").slice(0, 100),
      });
    // Occasionally prune old rows (keeps the table small without a cron job).
    if (Math.random() < 0.05) await pruneErrors();
  } catch (e) {
    console.error("Could not save error log", e);
  }
}

export async function pruneErrors(days?: number) {
  const keep = days ?? (await import("@/lib/settings").then((m) => m.getSettings())).errorLogDays;
  await getDb()
    .delete(errorLogs)
    .where(lt(errorLogs.createdAt, new Date(Date.now() - keep * 86_400_000)));
}

export async function listErrors(opts: { source?: ErrorSource; page: number }) {
  const where: SQL | undefined = opts.source ? eq(errorLogs.source, opts.source) : undefined;
  const db = getDb();
  const [rows, [{ n }]] = await Promise.all([
    db
      .select()
      .from(errorLogs)
      .where(where)
      .orderBy(desc(errorLogs.createdAt))
      .limit(ERROR_PAGE_SIZE)
      .offset((opts.page - 1) * ERROR_PAGE_SIZE),
    db.select({ n: count() }).from(errorLogs).where(where),
  ]);
  return { rows, total: n };
}

/** Errors in the last 24 hours (for the overview badge). */
export async function recentErrorCount() {
  const [{ n }] = await getDb()
    .select({ n: count() })
    .from(errorLogs)
    .where(gt(errorLogs.createdAt, new Date(Date.now() - 86_400_000)));
  return n;
}

export async function clearErrors(source?: ErrorSource) {
  await getDb()
    .delete(errorLogs)
    .where(source ? eq(errorLogs.source, source) : undefined);
}
