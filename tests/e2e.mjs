// End-to-end browser tests for the shop and the dashboard. Run: npm run test:e2e
//
// - Builds the app into its own folder (.next-e2e), so it never shares caches with `npm run dev`.
// - Starts a throwaway real PostgreSQL 17 (embedded-postgres) and applies every migration.
// - Runs the production server on it — no email, no Razorpay, never the database in .env.
// - Drives your installed Chrome (or CHROME_PATH) through the dashboard and the shop.
// Options: E2E_SKIP_BUILD=1 (reuse the last build), E2E_PORT (default 3300), CHROME_PATH.
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "tests", "e2e-output") + path.sep; // screenshots (git-ignored)
fs.mkdirSync(OUT, { recursive: true });
const DIST = ".next-e2e";
const PG_PORT = 54000 + Math.floor(Math.random() * 900);
const APP_PORT = Number(process.env.E2E_PORT || 3300);
const B = `http://localhost:${APP_PORT}`;
const P = "berrys-office-test"; // dashboard address for the test server
const OWNER = "owner@berrys.test";
const isWin = process.platform === "win32";

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
const h = (t) => crypto.createHash("sha256").update(t).digest("hex");

// ---- seed: the owner (signed in, dashboard unlocked) and a product with stock
const [u] = await q(`insert into users (email, name) values ($1, 'Owner') returning id`, [OWNER]);
const [st] = await q(
  `insert into staff_members (email, role, access_mode, password_hash, created_by) values ($1, 'admin', 'full', 'scrypt$test', 'test') returning id`,
  [OWNER],
);
const tok = crypto.randomBytes(32).toString("base64url");
const dtok = crypto.randomBytes(32).toString("base64url");
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

const results = [];
const check = (n, ok, x = "") => (
  results.push(!!ok), console.log(`${ok ? "✓" : "✗"} ${n}${x ? "  " + x : ""}`)
);
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" },
);
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
await ctx.addCookies([
  { name: "berrys_session", value: tok, url: B },
  { name: "berrys_dash", value: dtok, url: B },
]);
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("dialog", (d) => d.accept());
// Requests still open (shown when a step times out).
const open = new Map();
page.on("request", (r) => open.set(r, r.method() + " " + new URL(r.url()).pathname));
page.on("requestfinished", (r) => open.delete(r));
page.on("requestfailed", (r) => open.delete(r));
// Photo uploads go to Supabase Storage in real use: answer them with a bundled image.
await page.route("**/api/admin/upload", (r) =>
  r.fulfill({ contentType: "application/json", body: JSON.stringify({ url: "/images/product-1.webp" }) }),
);
const go = (p) => page.goto(`${B}/${P}${p}`, { waitUntil: "networkidle" });
const bulkMsg = async (id) => {
  const m = page.locator(`#${id} .form-msg`);
  await m.waitFor({ timeout: 20000 });
  return m.innerText();
};
const tick = async (labels) => {
  for (const l of labels) await page.getByLabel(l, { exact: true }).check();
};
const step = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    const waiting = [...open.values()].slice(0, 5).join(", ");
    check(
      `${name}: no crash`,
      false,
      e.message.split("\n")[0] + (waiting ? `  (still loading: ${waiting})` : ""),
    );
  }
};

try {
  // ------------------------------------------------ Categories: add several + Save all + bulk
  await step("categories", async () => {
    await go("/categories");
    const re = page.locator(".rows-editor");
    await re.getByLabel("Name (row 1)").fill("E2E Alpha");
    await re.getByRole("button", { name: /Add another category/ }).click();
    await re.getByLabel("Name (row 2)").fill("E2E Beta");
    await re.getByRole("button", { name: /Add another category/ }).click();
    await re.getByLabel("Name (row 3)").fill(cats[0].name); // duplicate → stays with an error
    await re.getByRole("button", { name: /Save all categories \(3\)/ }).click();
    const msg = await re.locator(".rows-actions .form-msg").innerText({ timeout: 20000 });
    const saved = await q(`select name from categories where name like 'E2E%' order by name`);
    check("add several categories: 2 saved", saved.length === 2, msg);
    await re
      .locator("tbody tr.row-error")
      .first()
      .waitFor({ timeout: 5000 })
      .catch(() => {});
    check("duplicate row stays, marked red", (await re.locator("tbody tr.row-error").count()) === 1);
    check(
      "failed row keeps Save all bar dirty",
      /1 unsaved change/.test(
        await page
          .locator(".save-all-bar")
          .innerText()
          .catch(() => ""),
      ),
    );
    await re.getByRole("button", { name: "Remove row 1" }).click();

    // Edit two category cards, then one Save all.
    const card = (n) => page.locator("section.dash-panel", { has: page.locator("h2", { hasText: n }) });
    await card("E2E Alpha").locator("input[name=description]").fill("Alpha desc");
    await card("E2E Beta").locator("input[name=description]").fill("Beta desc");
    const bar = page.locator(".save-all-bar");
    check(
      "Save all bar counts the edits",
      /3 unsaved changes/.test(await bar.innerText()),
      await bar.innerText(),
    );
    await bar.getByRole("button", { name: "Save all" }).click();
    await bar.getByText(/Saved \d+/).waitFor({ timeout: 30000 });
    const d = await q(`select name, description from categories where name like 'E2E%' order by name`);
    check(
      "Save all saved both cards",
      d[0]?.description === "Alpha desc" && d[1]?.description === "Beta desc",
    );

    await tick(["Select E2E Alpha", "Select E2E Beta"]);
    check(
      "bulk bar counts 2",
      /2 categories selected/.test(await page.locator("#categories-bulk").innerText()),
    );
    await page.locator("#categories-bulk").getByRole("button", { name: "Hide" }).click();
    const m1 = await bulkMsg("categories-bulk");
    const hidden = await q(`select count(*)::int n from categories where name like 'E2E%' and not active`);
    check("bulk hide categories", hidden[0].n === 2, m1);
    await go("/categories");
    await tick(["Select E2E Alpha", "Select E2E Beta"]);
    await page.locator("#categories-bulk").getByRole("button", { name: "Delete" }).click();
    const m2 = await bulkMsg("categories-bulk");
    check(
      "bulk delete categories",
      (await q(`select 1 from categories where name like 'E2E%'`)).length === 0,
      m2,
    );
  });

  // ------------------------------------------------ Products: add several + bulk
  await step("products", async () => {
    await go("/products");
    await page.getByRole("link", { name: "Add products" }).click();
    await page.waitForURL(/products\/new/);
    const re = page.locator(".rows-editor");
    const pic = { name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") };
    await re.getByLabel("Photos (row 1)").setInputFiles([pic, { ...pic, name: "b.jpg" }]);
    await re.locator(".rows-card").first().locator("img").nth(1).waitFor();
    await re.getByLabel("Name (row 1)").fill("E2E Shirt One");
    await re.getByLabel("Category (row 1)").selectOption(cats[0].name);
    await re.getByLabel("MRP ₹ (row 1)").fill("499");
    await re.getByLabel("Sale price ₹ (row 1)").fill("399");
    for (const s of cats[0].sizes)
      await re.getByLabel(`${s} — Stock by size (row 1)`, { exact: true }).fill("5");
    await re.getByLabel("Tags (row 1)").fill("cotton, summer");
    await re.getByRole("button", { name: "Copy row 1" }).click();
    await re.getByLabel("Name (row 2)").fill("E2E Shirt Two");
    await re.getByRole("button", { name: /Save products \(2\)/ }).click();
    const msg = await re.locator(".rows-actions .form-msg").innerText({ timeout: 30000 });
    const ps = await q(`select id, images, tags from products where name like 'E2E Shirt%'`);
    const own = await q("select value, name from offers where product_id = any($1)", [ps.map((p) => p.id)]);
    check(
      "products: sale price saved as each product's own offer",
      own.length === 2 && own.every((x) => x.value === 399 && x.name === "Special price"),
      JSON.stringify(own),
    );
    check(
      "products: two photos and tags kept",
      ps.length === 2 && ps.every((p) => p.images.length === 2 && p.tags.includes("summer")),
      JSON.stringify(ps[0] ?? {}),
    );
    const inv = await q(
      `select min(quantity)::int lo, max(quantity)::int hi, count(*)::int n from inventory where product_id = any($1)`,
      [ps.map((p) => p.id)],
    );
    check(
      "add several products: 2 saved with stock 5 per size",
      ps.length === 2 && inv[0].lo === 5 && inv[0].hi === 5 && inv[0].n === 2 * cats[0].sizes.length,
      msg,
    );

    await go("/products?q=E2E+Shirt");
    await page.locator("thead").getByLabel("Select all on this page").check();
    check(
      "select all ticks both",
      /2 products selected/.test(await page.locator("#products-bulk").innerText()),
    );
    await page.locator("#products-bulk").getByRole("button", { name: "Hide" }).click();
    const m1 = await bulkMsg("products-bulk");
    check(
      "bulk hide products",
      (await q(`select 1 from products where name like 'E2E Shirt%' and not active`)).length === 2,
      m1,
    );
    await go("/products?q=E2E+Shirt");
    await page.locator("thead").getByLabel("Select all on this page").check();
    await page.locator("#products-bulk").getByRole("button", { name: "Delete" }).click();
    const m2 = await bulkMsg("products-bulk");
    check(
      "bulk delete products",
      (await q(`select 1 from products where name like 'E2E Shirt%'`)).length === 0,
      m2,
    );
  });

  // ------------------------------------------------ Stock: add several + bulk
  await step("stock", async () => {
    const p = prods[0];
    const sizes = (await q(`select sizes from categories where name=$1`, [p.category]))[0].sizes;
    const qty = async (s) =>
      (await q(`select quantity from inventory where product_id=$1 and size=$2`, [p.id, s]))[0]?.quantity ??
      0;
    const [b0, b1] = [await qty(sizes[0]), await qty(sizes[1])];
    await go("/stock");
    const re = page.locator(".rows-editor");
    await re.getByLabel("Product (row 1)").selectOption(p.id);
    await re.getByLabel("Size (row 1)").selectOption(sizes[0]);
    await re.getByLabel("Change (row 1)").fill("7");
    await re.getByRole("button", { name: "Copy row 1" }).click();
    await re.getByLabel("Size (row 2)").selectOption(sizes[1]);
    await re.getByLabel("Change (row 2)").fill("3");
    await re.getByRole("button", { name: /Save stock changes \(2\)/ }).click();
    const msg = await re.locator(".rows-actions .form-msg").innerText({ timeout: 20000 });
    check(
      "add several stock rows",
      (await qty(sizes[0])) === b0 + 7 && (await qty(sizes[1])) === b1 + 3,
      msg,
    );

    await q(`update inventory set quantity = 2 where product_id=$1 and size=$2`, [p.id, sizes[0]]);
    await go("/stock");
    await page.getByLabel(`Select ${p.name} size ${sizes[0]}`, { exact: true }).check();
    await page.locator("#stock-bulk input[name=amount]").fill("4");
    await page.locator("#stock-bulk").getByRole("button", { name: "Add to each" }).click();
    const m1 = await bulkMsg("stock-bulk");
    check("bulk add to low stock", (await qty(sizes[0])) === 6, m1);
    await q(`update inventory set quantity = 1 where product_id=$1 and size=$2`, [p.id, sizes[0]]);
    await go("/stock");
    await page.getByLabel(`Select ${p.name} size ${sizes[0]}`, { exact: true }).check();
    await page.locator("#stock-bulk").getByRole("button", { name: "Mark sold out" }).click();
    const m2 = await bulkMsg("stock-bulk");
    check("bulk mark sold out", (await qty(sizes[0])) === 0, m2);
  });

  // ------------------------------------------------ Team: add several + Save all + bulk
  await step("team", async () => {
    await go("/team");
    const re = page.locator(".rows-editor");
    await re.getByLabel("Google email (row 1)").fill("e2e1@example.test");
    await re.getByRole("button", { name: /Add another person/ }).click();
    await re.getByLabel("Google email (row 2)").fill("e2e2@example.test");
    await re.getByLabel("Role (row 2)").selectOption("admin");
    await re.getByRole("button", { name: /Save people \(2\)/ }).click();
    const msg = await re.locator(".rows-actions .form-msg").innerText({ timeout: 20000 });
    const t = await q(
      `select email, role, access_mode, active, notify_orders from staff_members where email like 'e2e%' order by email`,
    );
    check(
      "add several people: staff→default, admin→full, both on",
      t.length === 2 &&
        t[0].access_mode === "default" &&
        t[1].role === "admin" &&
        t[1].access_mode === "full" &&
        t.every((x) => x.active && x.notify_orders),
      msg,
    );
    await go("/team");
    const card = (e) => page.locator("section.dash-panel", { has: page.locator("h2", { hasText: e }) });
    await card("e2e1@example.test").locator("input[name=name]").fill("Asha");
    await card("e2e2@example.test").locator("input[name=name]").fill("Ravi");
    await page.locator(".save-all-bar").getByRole("button", { name: "Save all" }).click();
    await page
      .locator(".save-all-bar")
      .getByText(/Saved 2/)
      .waitFor({ timeout: 30000 });
    const n = await q(`select name from staff_members where email like 'e2e%' order by email`);
    check("Save all saved two team cards", n[0].name === "Asha" && n[1].name === "Ravi");

    await tick(["Select e2e1@example.test", "Select e2e2@example.test"]);
    await page.locator("#team-bulk").getByRole("button", { name: "Block dashboard" }).click();
    const m1 = await bulkMsg("team-bulk");
    check(
      "bulk block dashboard",
      (await q(`select 1 from staff_members where email like 'e2e%' and not active`)).length === 2,
      m1,
    );
    await go("/team");
    check("owner card has no tick box", (await page.getByLabel(`Select ${OWNER}`).count()) === 0);
    await tick(["Select e2e1@example.test", "Select e2e2@example.test"]);
    await page.locator("#team-bulk").getByRole("button", { name: "Remove" }).click();
    const m2 = await bulkMsg("team-bulk");
    check(
      "bulk remove people",
      (await q(`select 1 from staff_members where email like 'e2e%'`)).length === 0,
      m2,
    );
  });

  // ------------------------------------------------ Orders and Payments
  await step("orders", async () => {
    for (const id of ["E2E-1", "E2E-2", "E2EP-1", "E2EP-2"])
      await q(
        `insert into orders (id, customer, email, phone, address, pincode, subtotal, total, status, expires_at, paid_at, razorpay_payment_id)
         values ($1, 'E2E Buyer', 'buyer@example.test', '9876543210', '1 Road', '560001', 100, 100, 'paid', now() + interval '1 day', now(), $2)`,
        [id, "pay_" + id],
      );
    await go("/orders?q=E2E-");
    await page.locator("thead").getByLabel("Select all on this page").check();
    await page.locator("#orders-bulk").getByRole("button", { name: "Mark packed" }).click();
    const m1 = await bulkMsg("orders-bulk");
    const s = await q(`select status from orders where id like 'E2E-%'`);
    check("bulk mark orders packed", s.length === 2 && s.every((x) => x.status === "packed"), m1);

    await go("/payments?q=E2EP");
    await page.locator("thead").getByLabel("Select all on this page").check();
    await page.locator("#payments-bulk").getByRole("button", { name: "Mark shipped" }).click();
    const m2 = await bulkMsg("payments-bulk");
    const s2 = await q(`select status from orders where id like 'E2EP-%'`);
    check("Payments: bulk mark shipped", s2.length === 2 && s2.every((x) => x.status === "shipped"), m2);

    await go("/orders?q=E2E");
    await page.locator("thead").getByLabel("Select all on this page").check();
    await page.locator("#orders-bulk").getByRole("button", { name: "Delete" }).click();
    const m3 = await bulkMsg("orders-bulk");
    check("bulk delete orders (result shown)", m3.length > 0, m3);
  });

  // ------------------------------------------------ Customers
  await step("customers", async () => {
    await q(
      `insert into users (email, name) values ('e2e-c1@example.test','C One'), ('e2e-c2@example.test','C Two')`,
    );
    await go("/customers?q=e2e-c");
    await page.locator("thead").getByLabel("Select all on this page").check();
    await page.locator("#customers-bulk").getByRole("button", { name: "Delete accounts" }).click();
    const m = await bulkMsg("customers-bulk");
    check(
      "bulk delete customers",
      (await q(`select 1 from users where email like 'e2e-c%'`)).length === 0,
      m,
    );
  });

  // ------------------------------------------------ Requests
  await step("requests", async () => {
    await q(`insert into approval_requests (type, target_id, reason, requested_by) values
      ('delete_product', 'e2e-x1', 'e2e', 'staff'), ('delete_product', 'e2e-x2', 'e2e', 'staff')`);
    await go("/requests");
    const boxes = page.getByLabel("Select this request");
    for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).check();
    await page.locator("#requests-bulk input[name=note]").fill("bulk no");
    await page.locator("#requests-bulk").getByRole("button", { name: "Reject" }).click();
    const m = await bulkMsg("requests-bulk");
    const r = await q(`select status, decision_note from approval_requests where reason='e2e'`);
    check(
      "bulk reject requests with note",
      r.every((x) => x.status === "rejected" && x.decision_note === "bulk no"),
      m,
    );
  });

  // ------------------------------------------------ Offers
  await step("offers", async () => {
    await q(
      `insert into offers (name, type, value, scope, starts_at) values ('E2E Offer 1','percent',10,'all',now()), ('E2E Offer 2','percent',15,'all',now())`,
    );
    await go("/offers");
    await tick(["Select E2E Offer 1", "Select E2E Offer 2"]);
    await page.locator("#offers-bulk").getByRole("button", { name: "Turn off" }).click();
    const m1 = await bulkMsg("offers-bulk");
    check(
      "bulk turn offers off",
      (await q(`select 1 from offers where name like 'E2E%' and not active`)).length === 2,
      m1,
    );
    await go("/offers");
    await tick(["Select E2E Offer 1", "Select E2E Offer 2"]);
    await page.locator("#offers-bulk").getByRole("button", { name: "Delete" }).click();
    const m2 = await bulkMsg("offers-bulk");
    check("bulk delete offers", (await q(`select 1 from offers where name like 'E2E%'`)).length === 0, m2);
  });

  // ------------------------------------------------ Settings and Website content: Save all
  await step("settings", async () => {
    await go("/settings");
    await page.locator("input[name=tagline]").fill("E2E tagline");
    await page.locator("input[name=returnDays]").fill("9");
    const bar = page.locator(".save-all-bar");
    check(
      "settings: bar shows 2 changes",
      /2 unsaved changes/.test(await bar.innerText()),
      await bar.innerText(),
    );
    await bar.getByRole("button", { name: "Save all" }).click();
    await bar.getByText(/Saved 2/).waitFor({ timeout: 30000 });
    await go("/settings");
    check(
      "settings saved by Save all",
      (await page.locator("input[name=tagline]").inputValue()) === "E2E tagline" &&
        (await page.locator("input[name=returnDays]").inputValue()) === "9",
    );
    await page.locator("input[name=tagline]").fill("discard me");
    await page.locator(".save-all-bar").getByRole("button", { name: "Clear changes" }).click();
    check(
      "Discard puts the old value back",
      (await page.locator("input[name=tagline]").inputValue()) === "E2E tagline",
    );
  });

  await step("content", async () => {
    await go("/content");
    const forms = page.locator("form[data-save-all].dash-form");
    const n = await forms.count();
    const fields = [];
    for (let i = 0; i < n && fields.length < 2; i++) {
      const f = forms
        .nth(i)
        .locator("input[type=text]:visible, input:not([type]):visible, textarea:visible")
        .first();
      if (await f.count()) {
        const name = await f.getAttribute("name");
        await f.fill(`E2E content ${fields.length + 1}`);
        fields.push({ i, name });
      }
    }
    const bar = page.locator(".save-all-bar");
    await bar.getByRole("button", { name: "Save all" }).click();
    await bar.getByText(/Saved \d+/).waitFor({ timeout: 30000 });
    await go("/content");
    let ok = fields.length === 2;
    for (const [k, f] of fields.entries())
      ok &&=
        (await forms.nth(f.i).locator(`[name="${f.name}"]`).first().inputValue()) === `E2E content ${k + 1}`;
    check("website content: two blocks saved by Save all", ok, JSON.stringify(fields));
  });

  // ------------------------------------------------ Customer refund requests, many at once
  await step("refunds", async () => {
    const mk = async (id) => {
      await q(
        `insert into orders (id, customer, email, phone, address, pincode, subtotal, total, status, expires_at, paid_at, refund_request, razorpay_payment_id)
         values ($1, 'E2E Refund', 'refund@example.test', '9876543210', '1 Road', '560001', 100, 100, 'delivered', now() + interval '1 day', now(), 'requested', 'pay_mock_' || $1)`,
        [id],
      );
      await q(
        `insert into refund_requests (order_id, whole_order, items, amount, reason) values ($1, true, '[]'::jsonb, 100, 'Too small')`,
        [id],
      );
    };
    for (const id of ["E2ER-1", "E2ER-2", "E2ER-3", "E2ER-4", "E2ER-5", "E2ER-6"]) await mk(id);
    const st = async (ids) =>
      (await q(`select status from refund_requests where order_id = any($1) order by order_id`, [ids])).map(
        (x) => x.status,
      );

    // Requests page (admin): reject needs a note; then reject two with one note.
    await go("/requests");
    await tick(["Select refund request for E2ER-1", "Select refund request for E2ER-2"]);
    await page.locator("#refund-bulk").getByRole("button", { name: "Reject" }).click();
    const m0 = await bulkMsg("refund-bulk");
    check(
      "bulk reject refunds without a note is refused",
      /reason/i.test(m0) && (await st(["E2ER-1"]))[0] === "requested",
      m0,
    );
    await page.locator("#refund-bulk input[name=note]").fill("Size was right per photos");
    await page.locator("#refund-bulk").getByRole("button", { name: "Reject" }).click();
    await page.locator("#refund-bulk .form-msg.ok").waitFor({ timeout: 20000 });
    const s1 = await st(["E2ER-1", "E2ER-2"]);
    check(
      "bulk reject refunds with a note",
      s1.every((x) => x === "rejected"),
      await page.locator("#refund-bulk .form-msg").innerText(),
    );
    await go("/requests");
    await tick(["Select refund request for E2ER-3"]);
    await page.locator("#refund-bulk").getByRole("button", { name: "Approve refunds" }).click();
    const m2 = await bulkMsg("refund-bulk");
    check("bulk approve refunds (Requests page)", (await st(["E2ER-3"]))[0] === "approved", m2);
    check(
      "approving sends the money back",
      (await q("select refunded_amount from orders where id = 'E2ER-3'"))[0].refunded_amount === 100 &&
        /paid/i.test(m2),
      m2,
    );
    // The customer's order page shows where the money is.
    await q("update orders set user_id = $1 where id = 'E2ER-3'", [u.id]);
    await page.goto(B + "/account/orders/E2ER-3", { waitUntil: "load" });
    await page.locator(".refund-track").first().waitFor({ timeout: 20000 });
    const track = await page
      .locator(".refund-track")
      .first()
      .innerText()
      .catch(() => "");
    check(
      "customer sees: Refund initiated → Processing → Refunded (demo = done)",
      /Refund initiated/.test(track) &&
        /Refunded/.test(track) &&
        (await page.locator(".refund-track.done").count()) === 1,
      track.replace(/\n+/g, " | ").slice(0, 160),
    );
    await q(
      "update order_refunds set gateway_status = 'initiated', processed_at = null where order_id = 'E2ER-3'",
    );
    await page.reload({ waitUntil: "load" });
    await page.locator(".refund-steps li.current").first().waitFor({ timeout: 20000 });
    check(
      "…and while it's on its way: Processing, 5–7 working days",
      (await page.locator(".refund-steps li.current").count()) === 1 &&
        /5–7 working days/.test(await page.locator(".refund-track").first().innerText()),
    );

    // Orders → refund requests filter (admin): approve by order.
    await go("/orders?status=refunds");
    await tick(["Select order E2ER-4"]);
    await page.locator("#order-refunds-bulk").getByRole("button", { name: "Approve refunds" }).click();
    const m3 = await bulkMsg("order-refunds-bulk");
    check("Orders refund view: bulk approve", (await st(["E2ER-4"]))[0] === "approved", m3);

    // Staff (Default access, no approvals): verify two with a recommendation.
    const [su] = await q(
      `insert into users (email, name) values ('e2e-staff@example.test','Staff') returning id`,
    );
    const [ss] = await q(
      `insert into staff_members (email, role, access_mode, password_hash, created_by) values ('e2e-staff@example.test','staff','default','scrypt$test','test') returning id`,
    );
    const t2 = crypto.randomBytes(32).toString("base64url");
    const d2 = crypto.randomBytes(32).toString("base64url");
    await q(
      `insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '1 hour')`,
      [h(t2), su.id],
    );
    await q(
      `insert into dashboard_sessions (token_hash, staff_id, login_token_hash, expires_at) values ($1, $2, $3, now() + interval '1 hour')`,
      [h(d2), ss.id, h(t2)],
    );
    const sctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    await sctx.addCookies([
      { name: "berrys_session", value: t2, url: B },
      { name: "berrys_dash", value: d2, url: B },
    ]);
    const sp = await sctx.newPage();
    sp.on("dialog", (d) => d.accept());
    await sp.goto(`${B}/${P}/orders?status=refunds`, { waitUntil: "networkidle" });
    check(
      "staff sees verify buttons, not approve",
      (await sp.locator("#order-refunds-bulk").getByRole("button", { name: "Approve refunds" }).count()) ===
        0,
    );
    await sp.getByLabel("Select order E2ER-5", { exact: true }).check();
    await sp.getByLabel("Select order E2ER-6", { exact: true }).check();
    await sp.locator("#order-refunds-bulk input[name=note]").fill("Checked photos");
    await sp
      .locator("#order-refunds-bulk")
      .getByRole("button", { name: "Verify — recommend approve" })
      .click();
    await sp.locator("#order-refunds-bulk .form-msg").waitFor({ timeout: 20000 });
    const v = await q(`select status, staff_note from refund_requests where order_id in ('E2ER-5','E2ER-6')`);
    check(
      "staff: bulk verify with recommendation",
      v.every((x) => x.status === "verified" && /Recommend: approve — Checked photos/.test(x.staff_note)),
      JSON.stringify(v),
    );
    await sctx.close();
  });

  // ------------------------------------------------ Offers: several at once + create form in Save all
  await step("offers several", async () => {
    // A product with its own sale price in cats[1] (MRP ₹1000, sale ₹800).
    await q(
      "insert into products (id, name, category, price, image, images, color, active) values ('e2e-sale-tee', 'E2E Sale Tee', $1, 1000, '/images/product-1.webp', '{/images/product-1.webp}', '#112233', true)",
      [cats[1].name],
    );
    for (const sz of cats[1].sizes) await q("insert into inventory values ('e2e-sale-tee', $1, 5)", [sz]);
    await q(
      "insert into offers (name, type, value, scope, targets, starts_at, product_id) values ('Special price', 'price', 800, 'product', '{e2e-sale-tee}', now() - interval '1 minute', 'e2e-sale-tee')",
    );
    await go("/offers");
    const box = page.locator(".new-offers");
    const card = (i) => box.locator("form.offer-form").nth(i);
    await card(0).locator("input[name=name]").fill("E2E Many 1");
    await card(0).getByLabel(cats[0].name, { exact: true }).check();
    await card(0).getByLabel(cats[1].name, { exact: true }).check();
    check(
      "conflict panel lists the product with its own sale price",
      /1 product has their own sale price/.test(await card(0).locator(".offer-conflicts").innerText()),
    );
    await box.getByRole("button", { name: /Add another offer/ }).click();
    await card(1).locator("input[name=name]").fill("E2E Many 2");
    await card(1).locator("select[name=scope]").selectOption("all");
    await card(1).locator("input[name=value]").fill("20");
    // Saving without choosing is refused, with a clear message.
    await card(0).getByRole("button", { name: "Create offer" }).click();
    check(
      "save without a choice is refused",
      /Choose Replace, Skip or Apply both/.test(await card(0).locator(".form-msg").innerText()),
    );
    check(
      "preview shows each outcome price",
      /Apply both → ₹720/.test(await card(0).getByLabel("Choice for E2E Sale Tee").innerText()),
    );
    await card(0).getByRole("button", { name: "Apply both to all" }).click();
    await card(1).getByRole("button", { name: "Skip all" }).click();
    await box.getByRole("button", { name: /Create all 2 offers/ }).click();
    for (
      let i = 0;
      i < 60 && (await q("select count(*)::int n from offers where name like 'E2E Many%'"))[0].n < 2;
      i++
    )
      await page.waitForTimeout(500);
    const o = await q(
      "select name, scope, targets, value, stacked, excluded from offers where name like 'E2E Many%' order by name",
    );
    check(
      "both offers created with their choices (Apply both / Skip)",
      o.length === 2 &&
        o[0].targets.length === 2 &&
        o[0].stacked.includes("e2e-sale-tee") &&
        o[1].scope === "all" &&
        o[1].value === 20 &&
        o[1].excluded.includes("e2e-sale-tee"),
      JSON.stringify(o),
    );
    await page.goto(B + "/products/e2e-sale-tee", { waitUntil: "networkidle" });
    const shop = await page.locator("main").innerText();
    check(
      "shop: 10% off the ₹800 sale price = ₹720, MRP ₹1,000 struck, 28% off",
      /₹720/.test(shop) && /₹1,000/.test(shop) && /28% off/.test(shop),
      shop.replace(/\n+/g, " | ").slice(0, 160),
    );
    // Sale prices list: change it there, and it's the product's price too.
    await go("/offers");
    await page.getByLabel("Sale price of E2E Sale Tee", { exact: true }).fill("600");
    const bar = page.locator(".save-all-bar");
    await bar.getByRole("button", { name: "Save all" }).click();
    await bar.getByText(/Saved \d+/).waitFor({ timeout: 30000 });
    await go("/products/e2e-sale-tee");
    check(
      "product editor asks how each covering offer treats the sale price",
      (await page.getByLabel("Choice for E2E Many 1").count()) === 1 &&
        /Apply both/.test(
          await page
            .getByLabel("Choice for E2E Many 1")
            .inputValue()
            .then((v) => (v === "both" ? "Apply both" : v)),
        ),
    );
    check(
      "product editor shows the sale price changed under Offers",
      (await page.locator('input[placeholder="No sale"]').inputValue()) === "600",
    );
    // Remove it from Offers → the product sells at its MRP (less the stacked 10%? no: no sale → offers from MRP).
    await go("/offers");
    await page.getByLabel("Select sale price of E2E Sale Tee").check();
    await page.locator("#sales-bulk").getByRole("button", { name: "Remove" }).click();
    await bulkMsg("sales-bulk");
    check(
      "removing the sale price removes it from the product",
      (await q("select 1 from offers where product_id='e2e-sale-tee'")).length === 0,
    );
    await q("delete from offers where name like 'E2E Many%'");
  });

  await step("team save all", async () => {
    await q(
      `insert into staff_members (email, role, access_mode, created_by) values ('e2e-card@example.test','staff','default','test')`,
    );
    await go("/team");
    const tre = page.locator(".rows-editor");
    await tre.getByLabel("Google email (row 1)").fill("e2e-single@example.test");
    await tre.getByLabel("Access (row 1)", { exact: true }).selectOption("manual");
    await tre.getByLabel("Chosen access (row 1)").click();
    await tre.locator(".rows-multi-list input[type=checkbox]").first().check();
    await page
      .locator("section.dash-panel", { has: page.locator("h2", { hasText: "e2e-card@example.test" }) })
      .locator("input[name=name]")
      .fill("Card Name");
    const bar = page.locator(".save-all-bar");
    check(
      "team: bar counts add form + card",
      /2 unsaved changes/.test(await bar.innerText()),
      await bar.innerText(),
    );
    await bar.getByRole("button", { name: "Save all" }).click();
    await bar.getByText(/Saved 2/).waitFor({ timeout: 30000 });
    const a = await q(
      `select access_mode, active, notify_orders from staff_members where email='e2e-single@example.test'`,
    );
    const c = await q(`select name from staff_members where email='e2e-card@example.test'`);
    const pm = await q(`select permissions from staff_members where email='e2e-single@example.test'`);
    check(
      "team: new person (chosen access) + card saved together",
      a[0]?.access_mode === "manual" &&
        pm[0].permissions.length === 1 &&
        a[0].active &&
        a[0].notify_orders &&
        c[0]?.name === "Card Name",
      JSON.stringify(pm[0]),
    );
    check(
      "team: add table empty after saving",
      (await page.locator(".rows-editor").getByLabel("Google email (row 1)").inputValue()) === "",
    );
  });

  await step("bar look", async () => {
    await page.setViewportSize({ width: 1360, height: 900 });
    await go("/settings");
    const bar = page.locator(".save-all-bar");
    check(
      "bar shown at the top with nothing to save",
      (await bar.isVisible()) &&
        /No unsaved changes/.test(await bar.innerText()) &&
        (await bar.getByRole("button", { name: "Save all" }).isDisabled()),
    );
    check(
      "bar is above the page heading",
      (await bar.boundingBox()).y < (await page.locator("h1").first().boundingBox()).y,
    );
    await page.locator("input[name=tagline]").fill("look");
    const colors = await bar
      .getByRole("button", { name: "Clear changes" })
      .evaluate(
        (b) =>
          getComputedStyle(b).color + " on " + getComputedStyle(b.closest(".save-all-bar")).backgroundColor,
      );
    check(
      "Clear changes is light text on the dark bar",
      /rgb\(255, 255, 255\) on rgb\((?!255)/.test(colors),
      colors,
    );
    await bar.screenshot({ path: OUT + "save-all-bar.png" });
    await page.mouse.wheel(0, 2500);
    await page.waitForTimeout(400);
    const y = (await bar.boundingBox()).y;
    check("bar stays at the top while scrolling", y >= -1 && y < 60, String(y));
    await bar.getByRole("button", { name: "Clear changes" }).click();
  });

  await step("data truth", async () => {
    const SHOT = OUT;
    await page.setViewportSize({ width: 1360, height: 900 });
    // A visible product in a category that has an offer.
    const cat = cats[2].name;
    await q(
      "insert into products (id, name, category, price, image, images, color, active) values ('e2e-offer-tee', 'E2E Offer Tee', $1, 1000, '/images/product-1.webp', '{/images/product-1.webp}', '#112233', true)",
      [cat],
    );
    for (const sz of cats[2].sizes) await q("insert into inventory values ('e2e-offer-tee', $1, 5)", [sz]);
    await q(
      "insert into offers (name, type, value, scope, targets, starts_at) values ('E2E Ten', 'percent', 10, 'category', $1, now() - interval '1 minute')",
      [[cat]],
    );
    await q("update offers set active = false where name <> 'E2E Ten'"); // only this offer, so prices are predictable
    await page.goto(B + "/products/e2e-offer-tee", { waitUntil: "networkidle" });
    check("product page shows the offer price", /₹900/.test(await page.locator("main").innerText()));
    // Set an end time the way staff do (dashboard save also refreshes the shop's offer cache).
    await go("/offers");
    const tomorrow = new Date(Date.now() + 86_400_000 + 330 * 60_000).toISOString().slice(0, 16);
    const ten = page.locator("section.offer-card", { has: page.locator("h3", { hasText: "E2E Ten" }) });
    await ten.locator("input[name=endsAt]").fill(tomorrow);
    await ten.getByRole("button", { name: "Save", exact: true }).click();
    await ten.locator(".form-msg").waitFor({ timeout: 20000 });
    await page.goto(B + "/products/e2e-offer-tee", { waitUntil: "networkidle" });
    const endTxt = await page
      .locator(".offer-note")
      .innerText()
      .catch(() => "");
    check("product page shows when the offer ends", /Offer ends tomorrow/.test(endTxt), endTxt);
    await page.goto(B + "/shop", { waitUntil: "networkidle" });
    check(
      "shop card shows when the offer ends",
      /Offer ends tomorrow/.test(
        await page.locator(".product-card", { hasText: "E2E Offer Tee" }).innerText(),
      ),
    );
    await q("update offers set ends_at = null where name='E2E Ten'");
    // The signed-in owner's bag lives in their account: put the item there, like another device would.
    await page.request.put(B + "/api/account/bag", {
      headers: { origin: B },
      data: { bag: [{ productId: "e2e-offer-tee", size: cats[2].sizes[0], quantity: 2 }], likes: [] },
    });
    await page.goto(B + "/cart", { waitUntil: "networkidle" });
    await page.locator(".cart-line").first().waitFor({ timeout: 30000 });
    const cart = await page.locator("main").innerText();
    check(
      "bag shows offer price, old price, offer name and savings",
      /₹900/.test(cart) &&
        /₹1,000/.test(cart) &&
        /E2E Ten/.test(cart) &&
        /Offer savings[\s\S]*₹200/.test(cart),
      cart.replace(/\n+/g, " | ").slice(0, 200),
    );
    await page.screenshot({ path: SHOT + "cart-offer.png" });

    // Rename the category in the dashboard: the offer follows.
    await go("/categories");
    const card = page.locator("section.dash-panel", { has: page.locator("h2", { hasText: cat }) }).first();
    await card.locator("input[name=name]").fill(cat + " New");
    await card.getByRole("button", { name: "Save", exact: true }).click();
    await card.locator(".form-msg").waitFor({ timeout: 20000 });
    const o = await q("select targets from offers where name='E2E Ten'");
    check(
      "category rename carries into the offer",
      o[0].targets[0] === cat + " New",
      JSON.stringify(o[0].targets),
    );
    await page.goto(B + "/products/e2e-offer-tee", { waitUntil: "networkidle" });
    check("offer still applies after the rename", /₹900/.test(await page.locator("main").innerText()));

    // Hide the category: its products leave the shop, and the dashboard says why.
    await go("/categories");
    const card2 = page
      .locator("section.dash-panel", { has: page.locator("h2", { hasText: cat + " New" }) })
      .first();
    await card2.locator("input[name=active]").uncheck();
    await card2.getByRole("button", { name: "Save", exact: true }).click();
    await card2.locator(".form-msg").waitFor({ timeout: 20000 });
    await page.goto(B + "/products/e2e-offer-tee", { waitUntil: "networkidle" });
    check(
      "product in a hidden category is not shown in the shop",
      (await page.getByRole("button", { name: /add to bag/i }).count()) === 0 &&
        !/E2E Offer Tee/.test(await page.locator("main").innerText()),
    );
    await page.goto(B + "/shop", { waitUntil: "networkidle" });
    check("…nor in the shop list", !/E2E Offer Tee/.test(await page.locator("main").innerText()));
    const api = await (await page.request.get(B + "/api/products?ids=e2e-offer-tee")).json();
    check("bag API treats it as unavailable", api.products.length === 0);
    await go("/products?q=E2E+Offer");
    check(
      "dashboard says 'Hidden (category hidden)'",
      /Hidden \(category hidden\)/.test(await page.locator("table").innerText()),
    );
    await q("update categories set active=true where name=$1", [cat + " New"]);

    // Settings facts on help pages and footer.
    await q(
      "insert into app_settings (key, value) values ('supportEmail', '\"help@example.test\"'::jsonb) on conflict (key) do update set value = excluded.value",
    ).catch(() => {});
    await page.goto(B + "/help/shipping-returns", { waitUntil: "networkidle" });
    const ship = await page
      .locator(".help-facts")
      .innerText()
      .catch(() => "");
    check(
      "shipping page shows live shipping + returns facts",
      /Shipping/.test(ship) && /Returns/.test(ship),
      ship.replace(/\n+/g, " | "),
    );
    const foot = await page.locator("footer").innerText();
    check(
      "footer mentions Razorpay only while it's on (on in this test)",
      /Secure payments by Razorpay/.test(foot),
    );

    // Layouts: no sideways scroll on Offers and Add products; stock page screenshot.
    for (const p of ["/offers", "/products/new"]) {
      await go(p);
      const over = await page
        .locator(p === "/offers" ? ".new-offers" : ".rows-editor")
        .evaluate((f) => f.scrollWidth - f.clientWidth);
      const pageOver = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(p + ": add form fits the screen", over <= 1 && pageOver <= 1, over + "/" + pageOver);
      await page.screenshot({ path: SHOT + (p === "/offers" ? "offers-form.png" : "products-form.png") });
    }
    await page.setViewportSize({ width: 820, height: 900 });
    await go("/offers");
    check(
      "/offers fits a tablet width too",
      (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1,
    );
    await page.setViewportSize({ width: 1360, height: 900 });
    await go("/stock");
    const order = await page
      .locator(".stock-page > section h2, .stock-page > .dash-stats")
      .evaluateAll((els) => els.map((e) => e.textContent.trim().slice(0, 22)));
    check(
      "stock page order: stats, add, needs restocking, history",
      /Units in stock/.test(order[0]) &&
        /Add or remove/.test(order[1]) &&
        /Needs restocking/.test(order[2]) &&
        /Stock history/.test(order[3]),
      JSON.stringify(order),
    );
    await page.screenshot({ path: SHOT + "stock-page.png", fullPage: true });
  });

  await step("home sections", async () => {
    await page.setViewportSize({ width: 1360, height: 900 });
    await go("/content");
    const cats = (
      await page.locator("#home-sections .pick-list").first().locator("label").allInnerTexts()
    ).map((n) => ({ name: n.trim() }));
    await q(
      "insert into offers (name, type, value, scope, targets, starts_at) values ('Home A', 'percent', 10, 'category', $1, now() - interval '1 minute'), ('Home B', 'percent', 12, 'category', $1, now() - interval '1 minute')",
      [[cats[3].name]],
    );
    await go("/content");
    const box = page.locator("#home-sections");
    await box.getByLabel(cats[1].name, { exact: true }).check({ force: true });
    await box.getByLabel(cats[2].name, { exact: true }).check({ force: true });
    await box.locator("label", { hasText: "Home B" }).locator("input").check({ force: true });
    await box.locator("input[name=offersTitle]").fill("This week’s offers");
    await box.getByRole("button", { name: "Save", exact: true }).click();
    await box.locator(".form-msg").waitFor({ timeout: 20000 });
    await page.goto(B + "/", { waitUntil: "networkidle" });
    const shelf = await page.locator(".category-shortcut b").allInnerTexts();
    check(
      "home shelf shows only the chosen categories",
      shelf.length === 3 &&
        shelf.includes(cats[1].name) &&
        shelf.includes(cats[2].name) &&
        !shelf.includes(cats[0].name),
      JSON.stringify(shelf),
    );
    const tiles = await page.locator(".offer-tile b").allInnerTexts();
    check(
      "home offers show only the chosen offer",
      tiles.length === 1 && tiles[0] === "Home B",
      JSON.stringify(tiles),
    );
    check(
      "offers title from Website content",
      (await page.locator("#offers-title").innerText()) === "This week’s offers",
    );
    check("no 'Special prices' tile", (await page.locator(".offer-tile.special").count()) === 0);
    const bg = await page
      .locator(".offer-tile")
      .first()
      .evaluate((e) => getComputedStyle(e).backgroundColor);
    check("offer tile uses the site's cream background", bg === "rgb(255, 254, 250)", bg);
    // Untick everything → all shown again.
    await go("/content");
    const ticked = box.locator(".pick-list input[type=checkbox]:checked");
    while (await ticked.count()) await ticked.first().uncheck({ force: true });
    const saved = page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().includes("/content"),
    );
    await box.getByRole("button", { name: "Save", exact: true }).click();
    await saved;
    await page.waitForTimeout(500);
    await page.goto(B + "/", { waitUntil: "networkidle" });
    const allShelf = await page.locator(".category-shortcut b").allInnerTexts();
    check(
      "nothing ticked = all categories again",
      cats.every((c) => allShelf.includes(c.name)) && allShelf.length > 3,
      JSON.stringify({ shown: allShelf, expected: cats.map((c) => c.name) }),
    );
    await q("delete from offers where name in ('Home A', 'Home B')");
  });

  await step("content preview", async () => {
    await page.setViewportSize({ width: 1360, height: 900 });
    const customerCtx = await browser.newContext();
    const customer = await customerCtx.newPage();
    await customer.goto(B + "/", { waitUntil: "networkidle" });
    const before = await customer.locator(".shelf-title h1").innerText();
    await go("/content");
    const homeForm = page.locator("form[data-save-all]", {
      has: page.locator('input[name="key"][value="home"]'),
    });
    await homeForm.locator('input[name="shelfTitle"]').fill("Preview heading E2E");
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    const frame = page.frameLocator('iframe[title="Home page template"]');
    await page.waitForTimeout(4000);
    await page.screenshot({ path: OUT + "content-preview.png" });
    await frame
      .locator(".shelf-title h1")
      .filter({ hasText: "Preview heading E2E" })
      .waitFor({ timeout: 30000 });
    check("template shows the unsaved heading", true);
    check(
      "template has product placeholders, no real products",
      (await frame.locator(".tpl-product").count()) >= 4 &&
        (await frame.locator(".product-card:not(.tpl-product)").count()) === 0,
    );
    check(
      "template has no links or working buttons",
      (await frame.locator("a[href]").count()) === 0 && (await frame.locator("button").count()) === 0,
    );
    check("template shows the logo", (await frame.locator(".site-brand img").count()) === 1);
    // Typing in the dashboard updates the template live.
    await homeForm.locator('input[name="shelfSubtitle"]').fill("Live subtitle E2E");
    await frame
      .locator(".shelf-title .tpl-edit")
      .filter({ hasText: "Live subtitle E2E" })
      .waitFor({ timeout: 10000 });
    check("template updates as you type in the form", true);
    // Editing in the template fills the form (not saved yet).
    const h1 = frame.locator(".shelf-title h1 .tpl-edit");
    await h1.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Edited in template E2E");
    await page.waitForTimeout(400);
    check(
      "editing in the template fills the form",
      (await homeForm.locator('input[name="shelfTitle"]').inputValue()) === "Edited in template E2E",
    );
    await page.getByRole("button", { name: "Close preview" }).click();
    check("…and marks it unsaved", /unsaved change/.test(await page.locator(".save-all-bar").innerText()));
    await customer.reload({ waitUntil: "networkidle" });
    check(
      "customers still see the published heading",
      (await customer.locator(".shelf-title h1").innerText()) === before,
    );
    // Save → live.
    await page.locator(".save-all-bar").getByRole("button", { name: "Save all" }).click();
    await page
      .locator(".save-all-bar")
      .getByText(/Saved \d+/)
      .waitFor({ timeout: 30000 });
    await customer.reload({ waitUntil: "networkidle" });
    check(
      "after saving customers see it",
      (await customer.locator(".shelf-title h1").innerText()) === "Edited in template E2E",
    );
    // The template page is for the team only.
    const r = await customer.goto(B + "/content-preview", { waitUntil: "networkidle" });
    check(
      "customers can't open the template page",
      r.status() === 404 || (await customer.locator(".tpl-root").count()) === 0,
    );
    await customerCtx.close();
  });

  await step("sidebar order", async () => {
    await go("");
    const owner = await page
      .locator(".dash-nav a, nav a")
      .evaluateAll((as) => as.map((a) => a.textContent.trim()).filter(Boolean));
    check(
      "owner sidebar: Overview, Sales & analytics, Requests first",
      /^Overview/.test(owner[0]) && /Sales & analytics/.test(owner[1]) && /Requests/.test(owner[2]),
      JSON.stringify(owner.slice(0, 5)),
    );
    const sctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const [su] = await q("select id from users where email = 'e2e-staff@example.test'");
    const [ss] = await q("select id from staff_members where email = 'e2e-staff@example.test'");
    if (su && ss) {
      const t2 = crypto.randomBytes(32).toString("base64url");
      const d2 = crypto.randomBytes(32).toString("base64url");
      await q(
        "insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '1 hour')",
        [h(t2), su.id],
      );
      await q(
        "insert into dashboard_sessions (token_hash, staff_id, login_token_hash, expires_at) values ($1, $2, $3, now() + interval '1 hour')",
        [h(d2), ss.id, h(t2)],
      );
      await sctx.addCookies([
        { name: "berrys_session", value: t2, url: B },
        { name: "berrys_dash", value: d2, url: B },
      ]);
      const sp = await sctx.newPage();
      await sp.goto(B + "/" + P, { waitUntil: "networkidle" });
      const staffNav = await sp
        .locator(".dash-nav a, nav a")
        .evaluateAll((as) => as.map((a) => a.textContent.trim()).filter(Boolean));
      check(
        "staff sidebar: Overview, Orders, Products, Stock first",
        /^Overview/.test(staffNav[0]) &&
          /^Orders/.test(staffNav[1]) &&
          /Products/.test(staffNav[2]) &&
          /Stock/.test(staffNav[3]),
        JSON.stringify(staffNav.slice(0, 5)),
      );
    }
    await sctx.close();
  });

  // ------------------------------------------------ phone width: no sideways scroll on a bulk page
  await step("mobile", async () => {
    await page.setViewportSize({ width: 390, height: 800 });
    await go("/products");
    await page.locator("thead").getByLabel("Select all on this page").check();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("phone: bulk bar fits (no page overflow)", over <= 1, `overflow ${over}px`);
  });

  // ------------------------------------------------ bag and favourites follow the account
  await step("bag follows the account", async () => {
    await q("delete from customer_bags"); // start from an empty account bag
    // Seed before any browser work (no direct database access while the browsers run).
    await q(
      "insert into products (id, name, category, price, image, images, color, active) values ('e2e-sync-tee', 'E2E Sync Tee', $1, 500, '/images/product-1.webp', '{/images/product-1.webp}', '#112233', true)",
      [cats[0].name],
    );
    for (const sz of cats[0].sizes) await q("insert into inventory values ('e2e-sync-tee', $1, 20)", [sz]);
    const signedIn = async (opts) => {
      const c = await browser.newContext(opts);
      await c.addCookies([{ name: "berrys_session", value: tok, url: B }]);
      return c;
    };
    const desk = await signedIn({ viewport: { width: 1300, height: 900 } });
    const phone = await signedIn({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
    const A = await desk.newPage();
    const P = await phone.newPage();
    const load = (pg, path) => pg.goto(B + path, { waitUntil: "domcontentloaded" });
    const settle = (pg) => pg.waitForTimeout(1500);
    const account = async (pg) => (await pg.request.get(B + "/api/account/bag")).json();

    await load(A, "/products/e2e-sync-tee");
    await A.locator(".size-buttons button").first().click();
    await A.getByRole("button", { name: /Add to bag/ }).click();
    await settle(A);
    let acc = await account(A);
    check(
      "desktop add is saved to the account",
      acc.bag.some((l) => l.productId === "e2e-sync-tee" && l.quantity === 1),
      JSON.stringify(acc.bag),
    );

    await load(P, "/cart");
    await P.locator(".cart-line", { hasText: "E2E Sync Tee" })
      .waitFor({ timeout: 15000 })
      .then(() => check("phone bag shows the desktop item", true))
      .catch(() => check("phone bag shows the desktop item", false));

    await P.locator(".cart-line", { hasText: "E2E Sync Tee" }).getByLabel("Increase quantity").click();
    await settle(P);
    await load(A, "/cart");
    await A.waitForFunction(
      () => /\b2\b/.test(document.querySelector(".cart-line .quantity")?.textContent ?? ""),
      null,
      { timeout: 15000 },
    )
      .then(() => check("phone quantity change shows on the desktop", true))
      .catch(() => check("phone quantity change shows on the desktop", false));

    // Desktop tab stays open; the phone removes it; desktop updates when its tab is shown again.
    await P.getByRole("button", { name: /Remove E2E Sync Tee/ }).click();
    await settle(P);
    await A.evaluate(() => window.dispatchEvent(new Event("focus")));
    await A.waitForFunction(() => !document.querySelector(".cart-line"), null, { timeout: 15000 })
      .then(() => check("phone removal reaches the open desktop tab", true))
      .catch(() => check("phone removal reaches the open desktop tab", false));
    check("account bag is empty", (await account(A)).bag.length === 0);

    await load(A, "/products/e2e-sync-tee");
    await A.getByLabel("Save to favourites").first().click();
    await settle(A);
    check("favourites saved to the account", (await account(A)).likes.includes("e2e-sync-tee"));
    await load(P, "/favourites");
    await P.locator(".product-card", { hasText: "E2E Sync Tee" })
      .waitFor({ timeout: 15000 })
      .then(() => check("favourites show on the phone", true))
      .catch(() => check("favourites show on the phone", false));

    // Guest bag kept on sign-in (merged with the account bag).
    await load(P, "/products/e2e-sync-tee");
    await P.locator(".size-buttons button").first().click();
    await P.getByRole("button", { name: /Add to bag/ }).click();
    await settle(P);
    const guest = await browser.newContext({ viewport: { width: 1300, height: 900 } });
    const G = await guest.newPage();
    await load(G, "/products/e2e-sync-tee");
    await G.locator(".size-buttons button").nth(1).click();
    await G.getByRole("button", { name: /Add to bag/ }).click();
    await G.waitForTimeout(300);
    await guest.addCookies([{ name: "berrys_session", value: tok, url: B }]);
    await load(G, "/cart");
    await settle(G);
    check(
      "signing in merges the guest bag with the account bag",
      (await G.locator(".cart-line").count()) === 2 && (await account(G)).bag.length === 2,
      String(await G.locator(".cart-line").count()),
    );

    // Sign out: this browser forgets the account's bag; the account keeps it.
    await guest.clearCookies();
    await load(G, "/cart");
    await settle(G);
    check("signed out: bag cleared from this browser", (await G.locator(".cart-line").count()) === 0);
    check("…and the account still has it", (await account(P)).bag.length === 2);

    // A different account signing in on that browser doesn't get the previous account's bag.
    await desk.close();
    await phone.close();
    await guest.close();
  });

  check("no browser errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
} finally {
  await browser.close().catch(() => {});
  // Stop the server and everything it started.
  if (isWin) spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], { shell: true, stdio: "ignore" });
  else {
    try {
      process.kill(-app.pid, "SIGTERM");
    } catch {}
  }
  await sql.end().catch(() => {});
  await pgServer.stop().catch(() => {});
  fs.rmSync(dbDir, { recursive: true, force: true });
  const failed = results.filter((x) => !x).length;
  if (failed) console.log("--- server log (last lines) ---\n" + log.split("\n").slice(-25).join("\n"));
  console.log(`\n${results.filter(Boolean).length} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
