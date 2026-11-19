import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { HttpError } from "@/lib/http-error";

/**
 * Best-effort client IP. Hosts like Vercel overwrite these headers with the
 * real address, so they can't be spoofed there. Behind another proxy, make
 * sure it sets x-real-ip / x-forwarded-for itself.
 */
export function clientIp(request: Request) {
  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/**
 * Fixed-window rate limit stored in Postgres, so it holds across serverless
 * instances. Throws a 429 HttpError once `limit` is exceeded within `windowSeconds`.
 */
export async function rateLimit(bucket: string, id: string, limit: number, windowSeconds: number) {
  const key = `${bucket}:${id}`;
  const rows = (await getDb().execute(sql`
    insert into rate_limits (key, window_start, count) values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
                   then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
                   then now() else rate_limits.window_start end
    returning count
  `)) as unknown as { count: number }[];

  // Occasionally clear out stale counters.
  if (Math.random() < 0.01) {
    await getDb().execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`);
  }

  if (rows[0]?.count > limit) {
    throw new HttpError(429, "Too many attempts. Please wait a few minutes and try again.");
  }
}
