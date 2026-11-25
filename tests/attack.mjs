// Attack tests: tries what a real attacker would, against the production build on a
// throwaway database. Run: npm run test:attack  (E2E_SKIP_BUILD=1 reuses the last build)
//
// Nothing here touches the live site, the real database, Razorpay or email.
import crypto from "node:crypto";
import { OWNER, P, checker, h, newToken, startStack } from "./harness.mjs";

const WEBHOOK_SECRET = "whsec_attack_test_only";
// Fake secrets: if any of these ever shows up in a page or a script, a secret is leaking.
const MARKERS = {
  SUPABASE_SERVICE_ROLE_KEY: "MARKER-srk-7f3a9c",
  RAZORPAY_KEY_SECRET: "MARKER-rzp-7f3a9c",
  RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
  GOOGLE_CLIENT_SECRET: "MARKER-goog-7f3a9c",
};

const stack = await startStack({
  extraEnv: MARKERS,
  // Customers A (attacker) and B (victim), a limited staff member, a paid order of B's.
  beforeServer: async ({ q, cats }) => {
    await q(
      `insert into site_content (key, value) values ('settings', '{"paymentMode":"demo"}'::jsonb)
       on conflict (key) do update set value = site_content.value || excluded.value`,
    );
    const mk = async (email, name) => {
      const [u] = await q(`insert into users (email, name) values ($1, $2) returning id`, [email, name]);
      const t = newToken();
      await q(
        `insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '2 hours')`,
        [h(t), u.id],
      );
      return { id: u.id, tok: t, email };
    };
    const A = await mk("attacker@example.test", "Attacker Ann");
    const V = await mk("victim@example.test", "Victim Bee");
    const S = await mk("staff@example.test", "Staff Sam");
    const [ss] = await q(
      `insert into staff_members (email, role, access_mode, password_hash, created_by) values ($1, 'staff', 'default', 'scrypt$test', 'test') returning id`,
      [S.email],
    );
    S.dash = newToken();
    await q(
      `insert into dashboard_sessions (token_hash, staff_id, login_token_hash, expires_at) values ($1, $2, $3, now() + interval '2 hours')`,
      [h(S.dash), ss.id, h(S.tok)],
    );
    const [addr] = await q(
      `insert into addresses (user_id, name, phone, line1, city, state, pincode) values ($1, 'Victim Bee', '9876543210', '12 Secret Street', 'Kochi', 'Kerala', '682001') returning id`,
      [V.id],
    );
    await q(
      `insert into orders (id, user_id, customer, email, phone, address, pincode, subtotal, total, status, expires_at, paid_at, razorpay_payment_id)
       values ('BRY-VICTIM', $1, 'Victim Bee', $2, '9876543210', '12 Secret Street', '682001', 400, 400, 'paid', now(), now(), 'pay_victim')`,
      [V.id, V.email],
    );
    await q(
      `insert into order_items (order_id, product_id, name, category, size, quantity, price) values ('BRY-VICTIM', 'e2e-stock-tee', 'E2E Stock Tee', $1, $2, 1, 400)`,
      [cats[0].name, cats[0].sizes[0]],
    );
    await q(
      `insert into products (id, name, category, price, image, images, color, active) values ('hidden-tee', 'Hidden Tee', $1, 300, '/images/product-1.webp', '{/images/product-1.webp}', '#112233', false)`,
      [cats[0].name],
    );
    await q(`insert into inventory values ('hidden-tee', $1, 10)`, [cats[0].sizes[0]]);
    return { A, V, S, victimAddress: addr.id, size: cats[0].sizes[0] };
  },
});
const { B, q, tok, dtok, seeded } = stack;
const { A, V, S, victimAddress, size } = seeded;
const { check, summary } = checker();

// ---- tiny HTTP client: cookies per "person", same-site Origin unless told otherwise
const cookie = (session, dash) =>
  [session && `berrys_session=${session}`, dash && `berrys_dash=${dash}`].filter(Boolean).join("; ");
let ip = "10.0.0.1";
async function call(path, { as = "", dash = "", method = "GET", body, origin = B, headers = {}, raw } = {}) {
  const res = await fetch(B + path, {
    method,
    redirect: "manual",
    headers: {
      "x-real-ip": ip,
      ...(origin ? { origin } : {}),
      ...(as || dash ? { cookie: cookie(as, dash) } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, text, json };
}
const one = async (s, p = []) => (await q(s, p))[0];
const address = {
  name: "Attacker Ann",
  phone: "9876500000",
  line1: "1 Test Road",
  city: "Kochi",
  state: "Kerala",
  pincode: "682001",
};
const checkout = (as, items, extra = {}) =>
  call("/api/checkout", { as, method: "POST", body: { items, address, ...extra } });
let section = 1;
const step = async (name, fn) => {
  ip = `10.0.0.${++section}`;
  try {
    await fn();
  } catch (e) {
    check(`${name}: no crash`, false, e.message.split("\n")[0]);
  }
};

try {
  // ------------------------------------------------ 1. the dashboard
  console.log("Dashboard access");
  await step("dashboard", async () => {
    for (const [who, as, dash] of [
      ["a visitor", "", ""],
      ["a signed-in customer", A.tok, ""],
      ["a customer with a stolen-looking dash cookie", A.tok, dtok],
    ]) {
      const r = await call(`/${P}/orders`, { as, dash });
      check(
        `${who} gets 404 at the dashboard`,
        r.status === 404 && !r.text.includes("BRY-VICTIM"),
        `got ${r.status}`,
      );
    }
    for (const guess of ["/admin", "/dashboard", "/wp-admin", "/administrator", "/berrys-office"]) {
      const r = await call(guess, { as: A.tok });
      check(`guessing ${guess} finds nothing`, r.status === 404, `got ${r.status}`);
    }
    const locked = await call(`/${P}/orders`, { as: tok });
    check(
      "the owner without the dashboard password sees no data",
      !locked.text.includes("BRY-VICTIM") && !locked.text.includes("Victim Bee"),
    );
    const owner = await call(`/${P}/orders`, { as: tok, dash: dtok });
    check(
      "the unlocked owner does see orders (control)",
      owner.status === 200 && owner.text.includes("BRY-VICTIM"),
    );
    for (const page of ["settings", "team"]) {
      const r = await call(`/${P}/${page}`, { as: S.tok, dash: S.dash });
      check(`staff without permission get 404 at ${page}`, r.status === 404, `got ${r.status}`);
    }
    const stolen = await call(`/${P}/orders`, { as: A.tok, dash: S.dash });
    check("a staff dash cookie is useless with another person's login", stolen.status === 404);
  });

  // ------------------------------------------------ 2. other people's data (IDOR)
  console.log("Changing IDs");
  await step("idor", async () => {
    const view = await call("/account/orders/BRY-VICTIM", { as: A.tok });
    check(
      "customer A can't open customer B's order",
      !view.text.includes("12 Secret Street") && !view.text.includes("Victim Bee"),
      `got ${view.status}`,
    );
    const mine = await call("/account/orders/BRY-VICTIM", { as: V.tok });
    check("customer B can open their own order (control)", mine.text.includes("BRY-VICTIM"));
    const put = await call(`/api/account/addresses/${victimAddress}`, {
      as: A.tok,
      method: "PUT",
      body: { ...address, line1: "Hacked Road 1" },
    });
    const del = await call(`/api/account/addresses/${victimAddress}`, { as: A.tok, method: "DELETE" });
    const still = await one(`select line1 from addresses where id = $1`, [victimAddress]);
    check(
      "A can't change or delete B's address",
      put.status === 404 && still?.line1 === "12 Secret Street",
      `put ${put.status} del ${del.status}`,
    );
    const listing = await call("/account/addresses", { as: A.tok });
    check("A's address book doesn't list B's address", !listing.text.includes("12 Secret Street"));
    const rr = await call("/api/account/refunds", {
      as: A.tok,
      method: "POST",
      body: { orderId: "BRY-VICTIM", wholeOrder: true, reason: "Wrong size", details: "" },
    });
    const made = await one(`select count(*)::int n from refund_requests where order_id = 'BRY-VICTIM'`);
    check("A can't ask for a refund of B's order", rr.status >= 400 && made.n === 0, `got ${rr.status}`);
  });

  // ------------------------------------------------ 3. prices and quantities
  console.log("Prices and quantities");
  await step("prices", async () => {
    const r = await checkout(A.tok, [{ productId: "e2e-stock-tee", size, quantity: 2, price: 1 }], {
      total: 1,
      subtotal: 1,
      shipping: 0,
    });
    const o =
      r.json?.orderId && (await one(`select subtotal, total from orders where id = $1`, [r.json.orderId]));
    check(
      "sending price: 1 still charges the real price",
      r.status === 200 && o?.subtotal === 800,
      `status ${r.status} subtotal ${o?.subtotal}`,
    );
    const bad = [
      ["a negative quantity", -1],
      ["zero", 0],
      ["half a piece", 1.5],
      ["a huge quantity", 100000],
      ["a quantity as text", "2"],
    ];
    for (const [label, quantity] of bad) {
      const before = await one(`select count(*)::int n from orders`);
      const x = await checkout(A.tok, [{ productId: "e2e-stock-tee", size, quantity }]);
      const after = await one(`select count(*)::int n from orders`);
      check(`ordering ${label} is refused`, x.status === 400 && after.n === before.n, `got ${x.status}`);
    }
    const ghost = await checkout(A.tok, [{ productId: "no-such-thing", size, quantity: 1 }]);
    check(
      "ordering a product that doesn't exist is refused",
      ghost.status >= 400 && ghost.status < 500,
      `got ${ghost.status}`,
    );
    const hidden = await checkout(A.tok, [{ productId: "hidden-tee", size, quantity: 1 }]);
    check(
      "ordering a hidden (unpublished) product is refused",
      hidden.status >= 400 && hidden.status < 500,
      `got ${hidden.status}`,
    );
    const stock = await one(
      `select quantity from inventory where product_id = 'e2e-stock-tee' and size = $1`,
      [size],
    );
    const over = await checkout(A.tok, [{ productId: "e2e-stock-tee", size, quantity: stock.quantity + 1 }]);
    check("ordering more than is in stock is refused", over.status === 409, `got ${over.status}`);
    const neg = await one(`select count(*)::int n from inventory where quantity < 0`);
    check("stock never goes below zero", neg.n === 0);
  });

  // ------------------------------------------------ 4. fake payments
  console.log("Fake payment confirmations");
  await step("payments", async () => {
    const o = (await checkout(A.tok, [{ productId: "e2e-stock-tee", size, quantity: 1 }])).json;
    const status = async () => (await one(`select status from orders where id = $1`, [o.orderId])).status;
    const v = await call("/api/checkout/verify", {
      as: A.tok,
      method: "POST",
      body: {
        orderId: o.orderId,
        razorpay_order_id: o.razorpay.orderId,
        razorpay_payment_id: "pay_fake",
        razorpay_signature: "0".repeat(64),
      },
    });
    check(
      "a made-up payment signature is rejected",
      v.status === 400 && (await status()) === "pending_payment",
      `got ${v.status}`,
    );

    const event = (orderId) =>
      JSON.stringify({
        event: "payment.captured",
        payload: { payment: { entity: { id: "pay_webhook_test", order_id: orderId } } },
      });
    const body = event(o.razorpay.orderId);
    const forged = await call("/api/webhooks/razorpay", {
      method: "POST",
      origin: "",
      raw: body,
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": crypto.createHmac("sha256", "guessed-secret").update(body).digest("hex"),
      },
    });
    const none = await call("/api/webhooks/razorpay", {
      method: "POST",
      origin: "",
      raw: body,
      headers: { "content-type": "application/json" },
    });
    check(
      "a forged webhook (wrong secret) is rejected",
      forged.status === 401 && (await status()) === "pending_payment",
      `got ${forged.status}`,
    );
    check("a webhook without a signature is rejected", none.status === 401, `got ${none.status}`);
    const tampered = body.replace("pay_webhook_test", "pay_webhook_evil");
    const t2 = await call("/api/webhooks/razorpay", {
      method: "POST",
      origin: "",
      raw: tampered,
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex"),
      },
    });
    check(
      "a real signature on an edited body is rejected",
      t2.status === 401 && (await status()) === "pending_payment",
      `got ${t2.status}`,
    );
    const real = await call("/api/webhooks/razorpay", {
      method: "POST",
      origin: "",
      raw: body,
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex"),
      },
    });
    check(
      "a correctly signed webhook is accepted (control)",
      real.status === 200 && (await status()) === "paid",
      `got ${real.status}`,
    );
    const replay = await call("/api/webhooks/razorpay", {
      method: "POST",
      origin: "",
      raw: body,
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex"),
      },
    });
    const events = await one(
      `select count(*)::int n from order_events where order_id = $1 and status = 'paid'`,
      [o.orderId],
    );
    check("replaying the same webhook changes nothing", replay.status === 200 && events.n === 1);

    // Demo pay: the victim's pending order can't be "paid" by someone else.
    const vo = (await checkout(V.tok, [{ productId: "e2e-stock-tee", size, quantity: 1 }])).json;
    const steal = await call("/api/checkout/mock-pay", {
      as: A.tok,
      method: "POST",
      body: { orderId: vo.orderId, razorpayOrderId: vo.razorpay.orderId },
    });
    const vs = (await one(`select status from orders where id = $1`, [vo.orderId])).status;
    check(
      "A can't mark B's order paid",
      steal.status === 404 && vs === "pending_payment",
      `got ${steal.status}`,
    );
    const mismatch = await call("/api/checkout/mock-pay", {
      as: V.tok,
      method: "POST",
      body: { orderId: "BRY-VICTIM", razorpayOrderId: vo.razorpay.orderId },
    });
    check(
      "mixing one order's id with another's payment id is refused",
      mismatch.status === 400,
      `got ${mismatch.status}`,
    );
    const own = await call("/api/checkout/mock-pay", {
      as: V.tok,
      method: "POST",
      body: { orderId: vo.orderId, razorpayOrderId: vo.razorpay.orderId },
    });
    check("B can pay their own demo order (control)", own.status === 200, `got ${own.status}`);
    const cancel = await call("/api/checkout/cancel", {
      method: "POST",
      body: { orderId: "BRY-VICTIM", razorpayOrderId: "mock_BRY-VICTIM" },
    });
    check(
      "cancelling someone's paid order from outside does nothing",
      (await one(`select status from orders where id = 'BRY-VICTIM'`)).status === "paid",
      `got ${cancel.status}`,
    );
  });

  // ------------------------------------------------ 5. other websites (CSRF / CORS)
  console.log("Requests from other websites");
  await step("origin", async () => {
    const evil = await call("/api/checkout", {
      as: A.tok,
      method: "POST",
      origin: "https://evil.example",
      body: { items: [] },
    });
    check("a checkout sent from another website is refused", evil.status === 403, `got ${evil.status}`);
    const cross = await call("/api/account/profile", {
      as: A.tok,
      method: "PATCH",
      origin: "",
      headers: { "sec-fetch-site": "cross-site" },
      body: { name: "Hijacked" },
    });
    check("a cross-site form post is refused", cross.status === 403, `got ${cross.status}`);
    const cors = await fetch(B + "/api/products?ids=e2e-stock-tee", {
      headers: { origin: "https://evil.example" },
    });
    check("other websites get no CORS permission", !cors.headers.get("access-control-allow-origin"));
    const pre = await fetch(B + "/api/checkout", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
    });
    check(
      "CORS preflight from another website isn't allowed",
      !pre.headers.get("access-control-allow-origin"),
    );
  });

  // ------------------------------------------------ 6. sign-in codes
  console.log("Guessing sign-in codes");
  await step("codes", async () => {
    const email = "victim@example.test";
    const code = "482913";
    await q(
      `insert into email_login_codes (email, code_hash, expires_at, attempts) values ($1, $2, now() + interval '10 minutes', 0)
       on conflict (email) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0`,
      [email, crypto.createHash("sha256").update(`login:${email}:${code}`).digest("hex")],
    );
    const tryCode = (c) => call("/api/auth/email", { method: "POST", body: { email, code: c } });
    let r;
    for (let i = 0; i < 5; i++) r = await tryCode(String(100000 + i));
    check(
      "after 5 wrong codes the code is dead",
      r.status === 400 && /expired|too many/i.test(r.json?.error ?? ""),
      r.json?.error,
    );
    const right = await tryCode(code);
    check("…and even the right code no longer works", right.status === 400);
    let limited = false;
    for (let i = 0; i < 8 && !limited; i++) limited = (await tryCode("000000")).status === 429;
    check("guessing more gets rate-limited", limited);
  });

  // ------------------------------------------------ 7. making yourself admin
  console.log("Becoming admin");
  await step("escalation", async () => {
    const r = await call("/api/account/profile", {
      as: A.tok,
      method: "PATCH",
      body: { name: "Attacker Ann", role: "admin", email: OWNER, isStaff: true, accessMode: "full" },
    });
    const me = await one(`select email from users where id = $1`, [A.id]);
    const staff = await one(`select count(*)::int n from staff_members where email = $1`, [A.email]);
    check(
      "extra fields (role, email) in a profile update are ignored",
      r.status === 200 && me.email === A.email && staff.n === 0,
      `got ${r.status}`,
    );
    const dash = await call(`/${P}`, { as: A.tok });
    check("…and the dashboard still says 404", dash.status === 404);
  });

  // ------------------------------------------------ 8. scripts in names and addresses (XSS)
  console.log("Script injection");
  await step("xss", async () => {
    const payload = `<script>alert('x')</script><img src=x onerror=alert(1)>`;
    const r = await call("/api/account/profile", { as: A.tok, method: "PATCH", body: { name: payload } });
    check("a name with HTML in it is accepted as plain text", r.status === 200);
    await call("/api/account/addresses", { as: A.tok, method: "POST", body: { ...address, line1: payload } });
    for (const [where, path, as, dash] of [
      ["the account page", "/account", A.tok, ""],
      ["the address book", "/account/addresses", A.tok, ""],
      ["the dashboard customer list", `/${P}/customers`, tok, dtok],
    ]) {
      const page = await call(path, { as, dash });
      const raw = page.text.includes("<script>alert('x')") || page.text.includes("<img src=x onerror");
      check(`the payload is harmless on ${where}`, page.status === 200 && !raw, `status ${page.status}`);
    }
    await call("/api/account/profile", { as: A.tok, method: "PATCH", body: { name: "Attacker Ann" } });
  });

  // ------------------------------------------------ 9. SQL injection and odd input
  console.log("SQL injection and odd input");
  await step("sqli", async () => {
    const before = await one(`select count(*)::int n from products`);
    for (const s of [`' OR 1=1--`, `'; DROP TABLE products;--`, `%' UNION SELECT email FROM users--`]) {
      const shop = await call(`/shop?q=${encodeURIComponent(s)}`);
      const api = await call(`/api/products?ids=${encodeURIComponent(s)}`);
      check(
        `search/API survive ${JSON.stringify(s)}`,
        shop.status === 200 && api.status < 500 && !shop.text.includes("attacker@example.test"),
        `shop ${shop.status} api ${api.status}`,
      );
    }
    const bag = await call("/api/account/bag", {
      as: A.tok,
      method: "PUT",
      body: {
        bag: [{ productId: "x' OR '1'='1", size: "M'; --", quantity: 1 }],
        likes: ["'; DELETE FROM users;--"],
      },
    });
    const after = await one(`select count(*)::int n from products`);
    const users = await one(`select count(*)::int n from users`);
    check(
      "injection strings in the bag are stored as plain text",
      bag.status < 500 && after.n === before.n && users.n >= 4,
      `got ${bag.status}`,
    );
    const logsBefore = await one(`select count(*)::int n from error_logs`);
    const junk = await call("/api/checkout", {
      as: V.tok,
      method: "POST",
      raw: "{not json",
      headers: { "content-type": "application/json" },
    });
    check(
      "broken JSON gets a clean 400, and nothing lands in the error log",
      junk.status === 400 && (await one(`select count(*)::int n from error_logs`)).n === logsBefore.n,
      `got ${junk.status}`,
    );
    const big = await call("/api/log-error", { method: "POST", body: { message: "x".repeat(200_000) } });
    check(
      "an oversized error report is ignored",
      big.status === 200 &&
        (await one(`select count(*)::int n from error_logs where length(message) > 1000`)).n === 0,
    );
  });

  // ------------------------------------------------ 10. file uploads
  console.log("Uploads");
  await step("uploads", async () => {
    const send = async (as, dash, name, type, bytes) => {
      const form = new FormData();
      form.append("file", new Blob([bytes], { type }), name);
      const res = await fetch(B + "/api/admin/upload", {
        method: "POST",
        headers: { origin: B, cookie: cookie(as, dash) },
        body: form,
      });
      return res.status;
    };
    const jpgHead = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    check("a customer can't upload at all", (await send(A.tok, "", "a.jpg", "image/jpeg", jpgHead)) === 404);
    check("a visitor can't upload at all", (await send("", "", "a.jpg", "image/jpeg", jpgHead)) === 404);
    check(
      "an HTML file renamed .jpg is refused",
      (await send(tok, dtok, "evil.jpg", "image/jpeg", Buffer.from("<html><script>alert(1)</script>"))) ===
        400,
    );
    check(
      "an SVG (can carry scripts) is refused",
      (await send(
        tok,
        dtok,
        "x.svg",
        "image/svg+xml",
        Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>`),
      )) === 400,
    );
    check(
      "a fake JPEG (right first bytes, script inside) is refused",
      (await send(
        tok,
        dtok,
        "poly.jpg",
        "image/jpeg",
        Buffer.concat([jpgHead, Buffer.from("<script>alert(1)</script>")]),
      )) === 400,
    );
    check(
      "a file over 5 MB is refused",
      (await send(
        tok,
        dtok,
        "big.jpg",
        "image/jpeg",
        Buffer.concat([jpgHead, Buffer.alloc(5 * 1024 * 1024 + 10)]),
      )) === 400,
    );
    check(
      "an empty file is refused",
      (await send(tok, dtok, "e.jpg", "image/jpeg", Buffer.alloc(0))) === 400,
    );
  });

  // ------------------------------------------------ 11. secrets and exposed files
  console.log("Secrets and exposed files");
  await step("exposure", async () => {
    for (const f of [
      "/.env",
      "/.env.local",
      "/.git/config",
      "/package.json",
      "/next.config.ts",
      "/db/schema.ts",
      "/drizzle.config.ts",
      "/tests/harness.mjs",
      "/.next/server/app-paths-manifest.json",
    ]) {
      const r = await call(f);
      check(`${f} isn't reachable`, r.status === 404, `got ${r.status}`);
    }
    const pages = await Promise.all(
      ["/", "/shop", "/account", "/login", `/${P}/orders`].map((p) =>
        call(p, { as: p.includes(P) ? tok : A.tok, dash: p.includes(P) ? dtok : "" }),
      ),
    );
    const scripts = new Set();
    for (const p of pages)
      for (const m of p.text.matchAll(/\/_next\/static\/[^"'\s)]+\.js/g)) scripts.add(m[0]);
    const bodies = [
      ...pages.map((p) => p.text),
      ...(await Promise.all([...scripts].map(async (s) => (await call(s)).text))),
    ];
    const leaks = Object.entries(MARKERS)
      .filter(([, v]) => bodies.some((b) => b.includes(v)))
      .map(([k]) => k);
    check(
      `no server secret appears in pages or ${scripts.size} browser scripts`,
      scripts.size > 0 && leaks.length === 0,
      leaks.join(", "),
    );
    const dbUrl = bodies.some((b) => /postgres(ql)?:\/\/[^"'\s]*@/.test(b));
    check("no database address appears in pages or scripts", !dbUrl);
    const maps = await call([...scripts][0] + ".map");
    check("source maps aren't published", maps.status === 404, `got ${maps.status}`);
    const err = await call("/api/checkout", {
      as: V.tok,
      method: "POST",
      raw: "[]",
      headers: { "content-type": "application/json" },
    });
    check("errors don't show stack traces", !/at \w+ \(|node_modules|\.ts:\d+/.test(err.text));
  });

  // ------------------------------------------------ 12. headers
  console.log("Security headers");
  await step("headers", async () => {
    const res = await fetch(B + "/");
    const hd = (n) => res.headers.get(n) ?? "";
    check(
      "Content-Security-Policy with a nonce",
      /script-src[^;]*'nonce-/.test(hd("content-security-policy")),
    );
    check(
      "no inline scripts allowed without the nonce",
      !/script-src[^;]*'unsafe-inline'/.test(hd("content-security-policy")) ||
        /'nonce-/.test(hd("content-security-policy")),
    );
    check(
      "pages can't be framed (clickjacking)",
      hd("x-frame-options") === "DENY" || /frame-ancestors 'none'/.test(hd("content-security-policy")),
    );
    check("X-Content-Type-Options: nosniff", hd("x-content-type-options") === "nosniff");
    check("Referrer-Policy set", !!hd("referrer-policy"));
    check("no X-Powered-By header", !hd("x-powered-by"));
    const login = await fetch(B + "/api/auth/email", {
      method: "POST",
      headers: { origin: B, "content-type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.test", code: "000000" }),
    });
    check(
      "API answers aren't cached by shared caches",
      /no-store|private/.test(login.headers.get("cache-control") ?? "") || login.status >= 400,
    );
  });

  // ------------------------------------------------ 13. stolen and old sessions
  console.log("Sessions");
  await step("sessions", async () => {
    const [u] = await q(
      `insert into users (email, name) values ('leaver@example.test', 'Lee Leaver') returning id`,
    );
    const live = newToken();
    const old = newToken();
    await q(
      `insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '1 hour'), ($3, $2, now() - interval '1 minute')`,
      [h(live), u.id, h(old)],
    );
    const signedIn = (r) => r.text.includes("Lee Leaver");
    const errsBefore = (await one(`select count(*)::int n from error_logs`)).n;
    for (const path of ["/account", "/account/orders/BRY-VICTIM"]) {
      const r = await fetch(B + path, { redirect: "manual", headers: { "x-real-ip": ip } });
      const body = await r.text();
      // A redirect is either an HTTP redirect, or (once the page has started streaming) a
      // redirect instruction inside the page — the browser follows both.
      const to = r.headers.get("location") ?? body.match(/NEXT_REDIRECT;[a-z]+;([^;"\\]+)/)?.[1] ?? "";
      check(
        `signed out, ${path} sends you to log in`,
        to.includes("/login") && !body.includes("Victim Bee") && !body.includes("12 Secret Street"),
        `got ${r.status} ${to}`,
      );
    }
    check(
      "…without logging any error",
      (await one(`select count(*)::int n from error_logs`)).n === errsBefore,
    );
    check("a valid session works (control)", signedIn(await call("/account", { as: live })));
    check("an expired session is refused", !signedIn(await call("/account", { as: old })));
    const forged = await call("/account", { as: newToken() });
    check("a made-up session token is refused", !signedIn(forged));
    const csrf = await call("/auth/signout", { as: live, method: "POST", origin: "https://evil.example" });
    check(
      "another website can't sign you out",
      csrf.status === 403 && signedIn(await call("/account", { as: live })),
    );
    const out = await call("/auth/signout", { as: live, method: "POST" });
    check("signing out works", out.status === 303);
    check("a copied cookie stops working after sign-out", !signedIn(await call("/account", { as: live })));
    const left = await one(`select count(*)::int n from sessions where token_hash = $1`, [h(live)]);
    check("signing out removes the session on the server", left.n === 0);
    const res = await fetch(B + "/account", {
      headers: { cookie: `berrys_session=${live}`, "x-real-ip": ip },
    });
    check("…and pages don't put it back", !(res.headers.get("set-cookie") ?? "").includes(live));
  });

  // ------------------------------------------------ 14. many requests at once (races and floods)
  console.log("Many requests at once");
  const person = async (email) => {
    const [u] = await q(`insert into users (email, name) values ($1, 'Racer') returning id`, [email]);
    const t = newToken();
    await q(
      `insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '1 hour')`,
      [h(t), u.id],
    );
    return { id: u.id, tok: t };
  };
  // Each parallel request comes from its own address, so only the per-account limits apply.
  const burst = (n, fn) =>
    Promise.all(Array.from({ length: n }, (_, i) => fn(i, `10.9.${section}.${i + 1}`)));
  const callFrom = (fromIp, path, opts) => {
    const saved = ip;
    ip = fromIp;
    const p = call(path, opts);
    ip = saved;
    return p;
  };

  await step("flood", async () => {
    const t0 = Date.now();
    const res = await burst(300, (i, from) =>
      callFrom(from, i % 2 ? "/" : "/api/products?ids=e2e-stock-tee"),
    );
    const s5 = res.filter((r) => r.status >= 500).length;
    check(
      "300 requests at once: no server errors",
      s5 === 0,
      `${s5} errors, ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );
    check("…and the site still answers normally afterwards", (await call("/")).status === 200);
    const prod = await Promise.all(
      Array.from({ length: 150 }, () => call("/api/products?ids=e2e-stock-tee")),
    );
    check(
      "150 product requests from one address get rate-limited",
      prod.some((r) => r.status === 429) && !prod.some((r) => r.status >= 500),
      `${prod.filter((r) => r.status === 429).length} limited`,
    );
  });

  await step("last-item race", async () => {
    await q(
      `insert into products (id, name, category, price, image, images, color, active) values ('race-tee', 'Race Tee', (select name from categories order by sort_order limit 1), 500, '/images/product-1.webp', '{/images/product-1.webp}', '#112233', true)`,
    );
    await q(`insert into inventory values ('race-tee', $1, 1)`, [size]);
    const buyers = await Promise.all(Array.from({ length: 20 }, (_, i) => person(`race${i}@example.test`)));
    const res = await burst(20, (i, from) =>
      callFrom(from, "/api/checkout", {
        as: buyers[i].tok,
        method: "POST",
        body: { items: [{ productId: "race-tee", size, quantity: 1 }], address },
      }),
    );
    const won = res.filter((r) => r.status === 200).length;
    const stock = await one(`select quantity from inventory where product_id = 'race-tee'`);
    const reserved = await one(
      `select coalesce(sum(i.quantity), 0)::int n from order_items i join orders o on o.id = i.order_id where i.product_id = 'race-tee' and o.status in ('pending_payment','paid')`,
    );
    check(
      "20 people buy the last piece at once: exactly 1 gets it",
      won === 1 && stock.quantity === 0 && reserved.n === 1,
      `${won} orders, stock ${stock.quantity}, reserved ${reserved.n}`,
    );
    check("…the others are told it's sold out, nothing crashes", !res.some((r) => r.status >= 500));
  });

  await step("one account, many checkouts", async () => {
    const R = await person("spammer@example.test");
    await q(`update inventory set quantity = 50 where product_id = 'race-tee'`);
    const res = await burst(30, (_, from) =>
      callFrom(from, "/api/checkout", {
        as: R.tok,
        method: "POST",
        body: { items: [{ productId: "race-tee", size, quantity: 1 }], address },
      }),
    );
    const made = await one(`select count(*)::int n from orders where user_id = $1`, [R.id]);
    check(
      "30 checkouts at once from one account: capped at 10",
      made.n <= 10 && res.filter((r) => r.status === 429).length >= 20,
      `${made.n} orders`,
    );
    const stock = await one(`select quantity from inventory where product_id = 'race-tee'`);
    check("…and stock adds up exactly", stock.quantity === 50 - made.n, `stock ${stock.quantity}`);
  });

  await step("double payment", async () => {
    const C = await person("payer@example.test");
    const o = (await checkout(C.tok, [{ productId: "e2e-stock-tee", size, quantity: 1 }])).json;
    const before = await one(
      `select quantity from inventory where product_id = 'e2e-stock-tee' and size = $1`,
      [size],
    );
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_race", order_id: o.razorpay.orderId } } },
    });
    const sig = crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
    const res = await burst(20, (i, from) =>
      i % 2
        ? callFrom(from, "/api/webhooks/razorpay", {
            method: "POST",
            origin: "",
            raw: body,
            headers: { "content-type": "application/json", "x-razorpay-signature": sig },
          })
        : callFrom(from, "/api/checkout/mock-pay", {
            as: C.tok,
            method: "POST",
            body: { orderId: o.orderId, razorpayOrderId: o.razorpay.orderId },
          }),
    );
    const paid = await one(
      `select count(*)::int n from order_events where order_id = $1 and status = 'paid'`,
      [o.orderId],
    );
    const after = await one(
      `select quantity from inventory where product_id = 'e2e-stock-tee' and size = $1`,
      [size],
    );
    check(
      "20 payment confirmations at once: order paid exactly once",
      paid.n === 1 && (await one(`select status from orders where id = $1`, [o.orderId])).status === "paid",
      `${paid.n} paid events`,
    );
    check(
      "…stock isn't taken twice",
      after.quantity === before.quantity,
      `${before.quantity} → ${after.quantity}`,
    );
    check("…nothing crashes", !res.some((r) => r.status >= 500));
  });

  await step("double refund", async () => {
    const D = await person("refunder@example.test");
    await q(
      `insert into orders (id, user_id, customer, email, phone, address, pincode, subtotal, total, status, expires_at, paid_at, razorpay_payment_id)
       values ('BRY-RACE', $1, 'Racer', 'refunder@example.test', '9876543210', '1 Test Road', '682001', 400, 400, 'paid', now(), now(), 'pay_race_refund')`,
      [D.id],
    );
    await q(
      `insert into order_items (order_id, product_id, name, category, size, quantity, price) values ('BRY-RACE', 'e2e-stock-tee', 'E2E Stock Tee', 'x', $1, 1, 400)`,
      [size],
    );
    const res = await burst(10, (_, from) =>
      callFrom(from, "/api/account/refunds", {
        as: D.tok,
        method: "POST",
        body: { orderId: "BRY-RACE", wholeOrder: true, items: [], reason: "Wrong size", details: "" },
      }),
    );
    const reqs = await one(`select count(*)::int n from refund_requests where order_id = 'BRY-RACE'`);
    check(
      "10 refund requests at once for one order: only 1 is created",
      reqs.n === 1 && res.filter((r) => r.status === 200).length === 1,
      `${reqs.n} requests, statuses ${[...new Set(res.map((r) => r.status))].join(",")}`,
    );
  });

  await step("parallel code guessing", async () => {
    const email = "race-victim@example.test";
    const code = "731905";
    await q(
      `insert into email_login_codes (email, code_hash, expires_at, attempts) values ($1, $2, now() + interval '10 minutes', 0)
       on conflict (email) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0`,
      [email, crypto.createHash("sha256").update(`login:${email}:${code}`).digest("hex")],
    );
    const res = await burst(40, (i, from) =>
      callFrom(from, "/api/auth/email", { method: "POST", body: { email, code: String(200000 + i) } }),
    );
    const row = await one(`select attempts from email_login_codes where email = $1`, [email]);
    // Lift the rate limit, so only the code's own lock can stop the right code.
    await q(`delete from rate_limits where key like 'email-login%'`);
    const right = await callFrom("10.9.99.1", "/api/auth/email", { method: "POST", body: { email, code } });
    check(
      "40 code guesses at once: exactly 5 counted, the code is dead",
      (!row || row.attempts === 5) && !res.some((r) => r.status === 200 || r.status >= 500),
      `attempts ${row?.attempts ?? "code removed"}; ${res.filter((r) => r.status === 429).length} rate-limited`,
    );
    check("…even the right code no longer works", right.status === 400, `right code → ${right.status}`);
  });
} finally {
  await stack.stop();
  process.exit(summary(stack.log()) ? 1 : 0);
}
