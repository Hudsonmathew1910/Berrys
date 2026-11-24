// Shared test stack for the browser tests (e2e.mjs) and the attack tests (attack.mjs):
// - builds the app into its own folder (.next-e2e), never sharing caches with `npm run dev`;
// - starts a throwaway real PostgreSQL 17 (embedded-postgres) with every migration;
// - seeds the owner (signed in, dashboard unlocked) and a product with stock;
// - runs the production server on it: no email, no Razorpay, never the database in .env.
// Options: E2E_SKIP_BUILD=1 (reuse the last build), E2E_PORT (default 3300).
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const OUT = path.join(ROOT, "tests", "e2e-output") + path.sep; // screenshots (git-ignored)
export const P = "berrys-office-test"; // dashboard address for the test server
export const OWNER = "owner@berrys.test";
export const isWin = process.platform === "win32";
export const h = (t) => crypto.createHash("sha256").update(t).digest("hex");
export const newToken = () => crypto.randomBytes(32).toString("base64url");
const DIST = ".next-e2e";

/**
 * Starts the whole stack. `extraEnv` is added to the server's (safe) environment;
 * `beforeServer({ q, sql, cats })` seeds more data before the server starts (its result is `seeded`).
 */
export async function startStack({ extraEnv = {}, beforeServer } = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  const PG_PORT = 54000 + Math.floor(Math.random() * 900);
  const APP_PORT = Number(process.env.E2E_PORT || 3300);
  const B = `http://localhost:${APP_PORT}`;

  // Safe environment for the build and the server: test database, nothing that sends or charges.
  const safeEnv = (dbUrl) => ({
    ...process.env,
    NEXT_DIST_DIR: DIST,
    DATABASE_URL: dbUrl,
    DIRECT_URL: "",
    ADMIN_PATH: P,
    STORE_OWNER_EMAIL: OWNER,
    SITE_URL: B,
    SMTP_USER: "",
    SMTP_PASS: "",
    RESEND_API_KEY: "",
    RAZORPAY_KEY_ID: "",
    RAZORPAY_KEY_SECRET: "",
    RAZORPAY_WEBHOOK_SECRET: "",
    FIREBASE_API_KEY: "",
    FIREBASE_PROJECT_ID: "",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    NEXT_PUBLIC_SUPABASE_URL: "https://test-project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "",
    ...extraEnv,
  });

  // ---- build (own folder)
  if (process.env.E2E_SKIP_BUILD !== "1") {
    console.log("Building into .next-e2e …");
    const b = spawnSync("npx", ["next", "build"], {
      cwd: ROOT,
      shell: true,
      stdio: "inherit",
      env: safeEnv("postgres://unused"),
    });
    if (b.status !== 0) process.exit(b.status ?? 1);
  }
  fs.rmSync(path.join(ROOT, DIST, "cache", "fetch-cache"), { recursive: true, force: true });

  // ---- database: a throwaway real PostgreSQL
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "berrys-e2e-pg-"));
  const pgServer = new EmbeddedPostgres({
    databaseDir: dbDir,
    user: "postgres",
    password: "postgres",
    port: PG_PORT,
    persistent: false,
    onLog: () => {},
    // UTF-8 like Supabase (Windows would otherwise pick its own code page, which can't store ₹).
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });
  await pgServer.initialise();
  await pgServer.start();
  const DB_URL = `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/postgres`;
  const sql = postgres(DB_URL, { max: 4, onnotice: () => {} });
  const q = (s, p = []) => sql.unsafe(s, p);
  // Stand-in for Supabase's storage schema (the bucket migration expects it).
  await sql
    .unsafe(
      `CREATE SCHEMA storage; CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);`,
    )
    .simple();
  for (const f of fs
    .readdirSync(path.join(ROOT, "drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    for (const s of fs.readFileSync(path.join(ROOT, "drizzle", f), "utf8").split("--> statement-breakpoint"))
      if (s.trim()) await sql.unsafe(s).simple();

  // ---- seed: the owner (signed in, dashboard unlocked) and a product with stock
  const [u] = await q(`insert into users (email, name) values ($1, 'Owner') returning id`, [OWNER]);
  const [st] = await q(
    `insert into staff_members (email, role, access_mode, password_hash, created_by) values ($1, 'admin', 'full', 'scrypt$test', 'test') returning id`,
    [OWNER],
  );
  const tok = newToken();
  const dtok = newToken();
  await q(
    `insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '2 hours')`,
    [h(tok), u.id],
  );
  await q(
    `insert into dashboard_sessions (token_hash, staff_id, login_token_hash, expires_at) values ($1, $2, $3, now() + interval '2 hours')`,
    [h(dtok), st.id, h(tok)],
  );
  const cats = await q(`select id, name, sizes from categories order by sort_order`);
  await q(
    `insert into products (id, name, category, price, image, images, color, active) values ('e2e-stock-tee', 'E2E Stock Tee', $1, 400, '/images/product-1.webp', '{/images/product-1.webp}', '#112233', true)`,
    [cats[0].name],
  );
  for (const s of cats[0].sizes) await q(`insert into inventory values ('e2e-stock-tee', $1, 10)`, [s]);
  const prods = await q(`select id, name, category from products order by name limit 5`);
  const seeded = beforeServer ? await beforeServer({ q, sql, cats }) : undefined;

  // ---- app server (production build, test database)
  const app = spawn("npx", ["next", "start", "-p", String(APP_PORT)], {
    cwd: ROOT,
    shell: true,
    detached: !isWin,
    env: safeEnv(DB_URL),
  });
  let log = "";
  app.stdout.on("data", (d) => (log += d));
  app.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 120 && !/Ready|started server/i.test(log); i++)
    await new Promise((r) => setTimeout(r, 500));

  /** Stops the server and the database, and deletes the database files. */
  const stop = async () => {
    if (isWin) spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], { shell: true, stdio: "ignore" });
    else {
      try {
        process.kill(-app.pid, "SIGTERM");
      } catch {}
    }
    await sql.end().catch(() => {});
    await pgServer.stop().catch(() => {});
    fs.rmSync(dbDir, { recursive: true, force: true });
  };

  return { B, sql, q, u, st, tok, dtok, cats, prods, seeded, log: () => log, stop };
}

/** Pass/fail counter shared by the suites. */
export function checker() {
  const results = [];
  const check = (n, ok, x = "") => (
    results.push(!!ok), console.log(`${ok ? "✓" : "✗"} ${n}${x ? "  " + x : ""}`)
  );
  const summary = (log) => {
    const failed = results.filter((x) => !x).length;
    if (failed) console.log("--- server log (last lines) ---\n" + log.split("\n").slice(-25).join("\n"));
    console.log(`\n${results.filter(Boolean).length} passed, ${failed} failed`);
    return failed;
  };
  return { check, summary };
}
