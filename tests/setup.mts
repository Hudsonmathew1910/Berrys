/**
 * Test setup: a throwaway in-memory Postgres (PGlite) with every migration
 * applied, and safe settings. Never touches Supabase, never sends email.
 * Import this first, before any app module.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 54000 + Math.floor(Math.random() * 1000);

// Safe environment: local test database, no email, no Razorpay, fixed owner and dashboard address.
for (const k of [
  "SMTP_USER",
  "SMTP_PASS",
  "RESEND_API_KEY",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "DIRECT_URL",
])
  delete process.env[k];
Object.assign(process.env, {
  DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  // PGlite is a single session: one connection keeps parallel queries from mixing.
  DATABASE_POOL_MAX: "1",
  ADMIN_PATH: "berrys-office-test",
  STORE_OWNER_EMAIL: "owner@berrys.test",
  SITE_URL: "http://localhost:3000",
});

// Next.js pieces that normally come from the server: request storage and a no-op data cache.
const g = globalThis as Record<string, unknown>;
g.AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
g.__incrementalCache = {
  generateSimpleCacheKey: async (k: string) => k,
  get: async () => null,
  set: async () => {},
  isOnDemandRevalidate: false,
};

const pg = await PGlite.create();
// Minimal stand-in for Supabase's storage schema so the bucket migration runs.
await pg.exec(`CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]);`);
const server = new PGLiteSocketServer({ db: pg, port: PORT, host: "127.0.0.1", maxConnections: 10 });
await server.start();

const migrations = fs
  .readdirSync(path.join(ROOT, "drizzle"))
  .filter((f) => f.endsWith(".sql"))
  .sort();

/** Runs migrations in order; `before(name)` runs just before each file (to add old-style data). */
export async function migrate(before?: (file: string) => Promise<void>) {
  for (const f of migrations) {
    await before?.(f);
    for (const s of fs.readFileSync(path.join(ROOT, "drizzle", f), "utf8").split("--> statement-breakpoint"))
      if (s.trim()) await pg.exec(s);
  }
}
export const exec = (s: string) => pg.exec(s);

let passed = 0;
let failed = 0;
/** One check. Failures are reported and counted; the run carries on. */
export async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log("  ✓", name);
  } catch (e) {
    failed++;
    console.log("  ✗", name);
    const err = e as Error & { cause?: Error };
    console.log("     ", err.message.split("\n").slice(0, 3).join("\n      "));
    if (err.cause) console.log("      cause:", err.cause.message);
  }
}

/** Prints the result, closes everything and sets the exit code. */
export async function finish(close?: () => Promise<unknown>) {
  console.log(`\n${passed} passed, ${failed} failed`);
  await close?.();
  await server.stop();
  await pg.close();
  process.exit(failed ? 1 : 0);
}
