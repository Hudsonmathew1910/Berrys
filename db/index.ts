import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "@/lib/env";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

// Reuse one connection pool across hot reloads in development.
const globalForDb = globalThis as unknown as { berrysDb?: Db };

/** A counting semaphore: at most `size` tasks run at once, the rest wait in order. */
function semaphore(size: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  const acquire = () =>
    new Promise<void>((resolve) => {
      if (active < size) {
        active++;
        resolve();
      } else waiting.push(resolve);
    });
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active--;
  };
  return async <T>(task: () => PromiseLike<T>): Promise<T> => {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  };
}

/**
 * postgres.js pipelines extra queries onto busy connections when more are
 * in flight than the pool size. Supabase's transaction pooler (Supavisor,
 * port 6543) can stall on pipelined queries, so we never send more queries
 * at once than there are connections. A transaction holds one slot for its
 * whole duration; queries inside it use its own reserved connection.
 */
function limitConcurrency(client: postgres.Sql, max: number): postgres.Sql {
  const run = semaphore(max);
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "unsafe") {
        return (query: string, params?: unknown[]) => {
          const exec = (mode: "rows" | "values") =>
            run(() => {
              const q = target.unsafe(query, params as never[]);
              return mode === "values" ? q.values() : q;
            });
          // Lazy like postgres.js: awaited directly (rows) or via .values() (arrays).
          return {
            values: () => exec("values"),
            then: <A, B>(ok?: (v: unknown) => A, err?: (e: unknown) => B) => exec("rows").then(ok, err),
          };
        };
      }
      if (prop === "begin") {
        return (...args: unknown[]) =>
          run(() => (target.begin as (...a: unknown[]) => Promise<unknown>)(...args));
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

export function getDb(): Db {
  if (!globalForDb.berrysDb) {
    const max = Number(process.env.DATABASE_POOL_MAX || 5);
    const client = postgres(serverEnv.databaseUrl(), {
      // Supabase's transaction pooler (port 6543) does not support prepared statements.
      prepare: false,
      max,
      // Fail fast instead of hanging if the database can't be reached.
      connect_timeout: 15,
    });
    globalForDb.berrysDb = drizzle(limitConcurrency(client, max), { schema });
  }
  return globalForDb.berrysDb;
}

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
