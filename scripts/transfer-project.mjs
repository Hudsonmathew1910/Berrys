// Moves the store from one Supabase project to another.
//   SOURCE = .env.vercel (old client account)   TARGET = .env.local (new client account)
//
//   node scripts/transfer-project.mjs check          test every connection in both files
//   node scripts/transfer-project.mjs copy           copy DB rows + product photos (target must be empty)
//   node scripts/transfer-project.mjs copy --replace same, but first empties the target's public tables
//
// The source is only read. Secret values are never printed. Photo URLs stored in
// the database are rewritten from the old Supabase project URL to the new one.
import fs from "node:fs";
import { parseEnv } from "node:util";
import postgres from "postgres";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

const SOURCE_FILE = ".env.vercel";
const TARGET_FILE = ".env.local";
const BUCKET = "product-images";
const BATCH = 500;

const mode = process.argv[2];
const replace = process.argv.includes("--replace");
if (mode !== "check" && mode !== "copy") {
  console.error("Usage: node scripts/transfer-project.mjs check | copy [--replace]");
  process.exit(1);
}

const load = (file) => parseEnv(fs.readFileSync(file, "utf8"));
const src = load(SOURCE_FILE);
const dst = load(TARGET_FILE);

const host = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return "(invalid url)";
  }
};
const base = (env) => (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const ok = (msg) => console.log(`  OK    ${msg}`);
const bad = (msg) => console.log(`  FAIL  ${msg}`);
const skip = (msg) => console.log(`  --    ${msg}`);
let failures = 0;
const attempt = async (label, fn) => {
  try {
    const r = await fn();
    ok(r ? `${label}: ${r}` : label);
    return true;
  } catch (e) {
    failures++;
    bad(`${label}: ${e?.cause?.message || e?.message || e}`);
    return false;
  }
};

function db(env, which = "DIRECT_URL") {
  let url = env[which] || env.DATABASE_URL;
  // Allow the password to live in DATABASE_PASSWORD when the URL has none.
  const u = new URL(url);
  if (!u.password && env.DATABASE_PASSWORD) {
    u.password = encodeURIComponent(env.DATABASE_PASSWORD);
    url = u.toString();
  }
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const ca = env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");
  return postgres(url, {
    max: 1,
    prepare: false,
    connect_timeout: 15,
    onnotice: () => {},
    ssl: local ? false : ca ? { ca, rejectUnauthorized: true } : "require",
  });
}
const storage = (env) =>
  createClient(base(env), env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage;

async function migrationCount(sql) {
  try {
    const [r] = await sql`select count(*)::int as n from drizzle.__drizzle_migrations`;
    return r.n;
  } catch {
    return 0;
  }
}

/** Public tables ordered so every table comes after the tables it references. */
async function tablesInOrder(sql) {
  const tables = (
    await sql`select table_name from information_schema.tables
              where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`
  ).map((r) => r.table_name);
  const deps = await sql`
    select c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f' and n.nspname = 'public'`;
  const strip = (t) => t.replace(/^public\./, "").replace(/"/g, "");
  const parents = new Map(tables.map((t) => [t, new Set()]));
  for (const d of deps) if (strip(d.child) !== strip(d.parent)) parents.get(strip(d.child))?.add(strip(d.parent));
  const out = [];
  const seen = new Set();
  const visit = (t, stack = new Set()) => {
    if (seen.has(t)) return;
    if (stack.has(t)) throw new Error(`foreign-key cycle at ${t}`);
    stack.add(t);
    for (const p of parents.get(t) ?? []) visit(p, stack);
    seen.add(t);
    out.push(t);
  };
  tables.forEach((t) => visit(t));
  return out;
}

async function rowCounts(sql, tables) {
  const counts = {};
  for (const t of tables) counts[t] = (await sql`select count(*)::int as n from ${sql(t)}`)[0].n;
  return counts;
}

async function listAll(store, prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await store.from(BUCKET).list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const e of data) {
      const path = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id === null) files.push(...(await listAll(store, path)));
      else files.push({ path, type: e.metadata?.mimetype });
    }
    if (data.length < 1000) break;
  }
  return files;
}

// ------------------------------------------------------------------ check
async function checkEnv(label, env) {
  console.log(`\n${label}`);
  console.log(`  supabase project: ${host(base(env))}`);

  for (const which of ["DATABASE_URL", "DIRECT_URL"]) {
    if (!env[which]) {
      skip(`${which} not set`);
      continue;
    }
    const sql = db(env, which);
    await attempt(`${which} (${host(env[which])})`, async () => {
      const [r] = await sql`select current_database() as d, current_user as u`;
      const n = await migrationCount(sql);
      return `connected as ${r.u}, ${n} migrations applied${env.DATABASE_CA_CERT ? ", CA verified" : ""}`;
    });
    await sql.end();
  }

  await attempt("Supabase Storage (service role key)", async () => {
    const { data, error } = await storage(env).listBuckets();
    if (error) throw error;
    const has = data.some((b) => b.id === BUCKET);
    const files = has ? (await listAll(storage(env))).length : 0;
    return has ? `bucket "${BUCKET}" has ${files} file(s)` : `no "${BUCKET}" bucket yet (migration 0001 creates it)`;
  });

  if (env.SMTP_USER && env.SMTP_PASS) {
    await attempt(`Gmail SMTP login (${env.SMTP_USER})`, async () => {
      const t = nodemailer.createTransport({ service: "gmail", auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
      await t.verify();
      t.close();
    });
  } else skip("SMTP not set");

  if (env.RESEND_API_KEY) {
    await attempt("Resend API key", async () => {
      const r = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
      });
      const body = await r.json().catch(() => ({}));
      if (r.ok) return `${body.data?.length ?? 0} domain(s)`;
      if (r.status === 401 && body.name === "restricted_api_key") return "valid (sending-only key)";
      throw new Error(`${r.status} ${body.message || ""}`);
    });
  } else skip("RESEND_API_KEY not set");

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    await attempt("Google OAuth client id/secret", async () => {
      // A fake code: Google answers invalid_grant if the client is right, invalid_client if not.
      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: "connection-test",
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: `${(env.SITE_URL || "").replace(/\/+$/, "")}/auth/google/callback`,
          grant_type: "authorization_code",
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (body.error === "invalid_grant") return "client accepted";
      throw new Error(`${body.error}: ${body.error_description || ""}`);
    });
  } else skip("Google login not set");

  if (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) {
    await attempt(`Razorpay keys (${env.RAZORPAY_KEY_ID.startsWith("rzp_live") ? "live" : "test"})`, async () => {
      const r = await fetch("https://api.razorpay.com/v1/orders?count=1", {
        headers: { Authorization: "Basic " + Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64") },
      });
      if (!r.ok) throw new Error(`${r.status} ${(await r.json().catch(() => ({})))?.error?.description || ""}`);
    });
  } else skip("Razorpay not set");

  if (env.SITE_URL) console.log(`  info  SITE_URL host: ${host(env.SITE_URL)}, owner email: ${env.STORE_OWNER_EMAIL || "(not set)"}`);
}

// ------------------------------------------------------------------- copy
async function copy() {
  if (base(src) === base(dst) || host(src.DIRECT_URL || src.DATABASE_URL) === host(dst.DIRECT_URL || dst.DATABASE_URL))
    throw new Error("source and target point at the same project; refusing to copy");

  const from = db(src);
  const to = db(dst);
  try {
    const ms = await migrationCount(from);
    let mt = await migrationCount(to);
    if (mt < ms) {
      const { drizzle } = await import("drizzle-orm/postgres-js");
      const { migrate } = await import("drizzle-orm/postgres-js/migrator");
      await migrate(drizzle(to), { migrationsFolder: "./drizzle" });
      console.log(`Applied ${(await migrationCount(to)) - mt} migration(s) to the target.`);
      mt = await migrationCount(to);
    }
    console.log(`Migrations: source ${ms}, target ${mt}`);
    if (ms !== mt) throw new Error("migration counts differ; run `npm run db:migrate` (it uses .env.local) first");

    const tables = await tablesInOrder(from);
    const targetTables = new Set(await tablesInOrder(to));
    const missing = tables.filter((t) => !targetTables.has(t));
    if (missing.length) throw new Error(`target is missing tables: ${missing.join(", ")}`);

    const before = await rowCounts(to, tables);
    const nonEmpty = tables.filter((t) => before[t] > 0);
    if (nonEmpty.length && !replace)
      throw new Error(
        `target already has rows in: ${nonEmpty.map((t) => `${t}(${before[t]})`).join(", ")}. ` +
          "Re-run with --replace to empty the target's public tables first.",
      );

    // ---- storage first, so the rewritten URLs point at files that exist
    console.log(`\nPhotos: ${host(base(src))} -> ${host(base(dst))}`);
    const s = storage(src);
    const d = storage(dst);
    const { data: buckets, error: be } = await d.listBuckets();
    if (be) throw be;
    if (!buckets.some((b) => b.id === BUCKET)) {
      const { error } = await d.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: 5242880,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      });
      if (error) throw error;
    }
    const files = await listAll(s);
    let copied = 0;
    for (const f of files) {
      const { data, error } = await s.from(BUCKET).download(f.path);
      if (error) throw new Error(`download ${f.path}: ${error.message}`);
      const up = await d.from(BUCKET).upload(f.path, data, { contentType: f.type || data.type, upsert: true });
      if (up.error) throw new Error(`upload ${f.path}: ${up.error.message}`);
      if (++copied % 25 === 0) console.log(`  ${copied}/${files.length}`);
    }
    const after = (await listAll(d)).length;
    console.log(`  copied ${copied} file(s); target bucket now has ${after}`);

    // ---- database rows, in one target transaction
    const oldPrefix = `${base(src)}/storage/v1/object/public/`;
    const newPrefix = `${base(dst)}/storage/v1/object/public/`;
    console.log(`\nRows (URL rewrite ${host(oldPrefix)} -> ${host(newPrefix)}):`);
    await from.begin("isolation level repeatable read read only", async (r) => {
      await to.begin(async (w) => {
        if (replace && nonEmpty.length)
          await w.unsafe(`truncate ${tables.map((t) => `"${t}"`).join(", ")} cascade`);
        for (const t of tables) {
          const cols = (
            await w`select column_name from information_schema.columns
                    where table_schema = 'public' and table_name = ${t} and is_generated = 'NEVER'
                    order by ordinal_position`
          ).map((c) => `"${c.column_name}"`);
          const list = cols.join(", ");
          let n = 0;
          for (let offset = 0; ; offset += BATCH) {
            const [{ j }] = await r.unsafe(
              `select coalesce(json_agg(x), '[]')::text as j from
                 (select ${list} from "${t}" order by ctid limit ${BATCH} offset ${offset}) x`,
            );
            const rows = j.split(oldPrefix).join(newPrefix);
            const count = JSON.parse(rows).length;
            if (!count) break;
            await w.unsafe(
              `insert into "${t}" (${list}) select ${list} from json_populate_recordset(null::"${t}", $1::json)`,
              [rows],
            );
            n += count;
            if (count < BATCH) break;
          }
          console.log(`  ${t.padEnd(22)} ${n}`);
        }
      });
    });

    // ---- verify
    const srcCounts = await rowCounts(from, tables);
    const dstCounts = await rowCounts(to, tables);
    const diff = tables.filter((t) => srcCounts[t] !== dstCounts[t]);
    const [{ n: leftover }] = await to.unsafe(
      `select (${tables
        .map((t) => `(select count(*) from "${t}" x where x::text like '%' || $1 || '%')`)
        .join(" + ")})::int as n`,
      [host(base(src))],
    );
    console.log(
      `\nVerify: ${diff.length ? `MISMATCH in ${diff.join(", ")}` : "row counts match in every table"}; ` +
        `${leftover} row(s) still mention the old project host; photos ${after >= files.length ? "complete" : "INCOMPLETE"}.`,
    );
    if (diff.length || after < files.length) failures++;
  } finally {
    await from.end();
    await to.end();
  }
}

try {
  if (mode === "check") {
    await checkEnv(`SOURCE  ${SOURCE_FILE}  (old client account)`, src);
    await checkEnv(`TARGET  ${TARGET_FILE}  (new client account)`, dst);
  } else await copy();
} catch (e) {
  failures++;
  console.error(`\nStopped: ${e?.cause?.message || e?.message || e}`);
}
console.log(failures ? `\n${failures} problem(s).` : "\nAll good.");
process.exit(failures ? 1 : 0);
