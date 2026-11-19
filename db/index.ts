import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "@/lib/env";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

// Reuse one connection pool across hot reloads in development.
const globalForDb = globalThis as unknown as { berrysDb?: Db };

export function getDb(): Db {
  if (!globalForDb.berrysDb) {
    const client = postgres(serverEnv.databaseUrl(), {
      // Supabase's transaction pooler (port 6543) does not support prepared statements.
      prepare: false,
      max: Number(process.env.DATABASE_POOL_MAX || 5),
    });
    globalForDb.berrysDb = drizzle(client, { schema });
  }
  return globalForDb.berrysDb;
}

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
