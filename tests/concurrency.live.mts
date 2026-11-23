// Race conditions against the REAL database in .env (Supabase pooler). Opt-in: npm run test:live
// Uses a temporary product and removes everything it creates. Email is switched off for the run.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(path.join(ROOT, ".env"));
for (const k of ["SMTP_USER", "SMTP_PASS", "RESEND_API_KEY", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"])
  delete process.env[k];
const g = globalThis as Record<string, unknown>;
g.AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
g.__incrementalCache = {
  generateSimpleCacheKey: async (k: string) => k,
  get: async () => null,
  set: async () => {},
  isOnDemandRevalidate: false,
};

const { sql } = await import("drizzle-orm");
const { getDb } = await import("../db/index.ts");
const orders = await import("../lib/orders.ts");
const adminOrders = await import("../lib/admin/orders.ts");
const cat = await import("../lib/admin/catalog.ts");
const team = await import("../lib/admin/team.ts");
const { checkoutSchema } = await import("../lib/validation.ts");
const db = getDb();
const q = async (s: ReturnType<typeof sql>) => (await db.execute(s)) as unknown as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any

const PID = `zz-loadtest-${Date.now()}`;
const created: string[] = [];
const stock = async (size: string) =>
  (await q(sql`select quantity from inventory where product_id=${PID} and size=${size}`))[0]
    ?.quantity as number;
const buy = (i: number, size: string) =>
  orders
    .createPendingOrder(
      checkoutSchema.parse({
        items: [{ productId: PID, size, quantity: 1 }],
        customer: "Load Test",
        email: `loadtest-${Date.now()}-${i}@example.invalid`,
        phone: "9876543210",
        address: "12 Lake Road, Bengaluru",
        pincode: "560038",
      }),
      null,
      { mode: "demo", ready: true },
    )
    .then((o: { orderId: string; razorpay: { orderId: string } }) => (created.push(o.orderId), o));

const [category] = await q(
  sql`select name, sizes from categories where active = true order by sort_order limit 1`,
);
const sizes: string[] = category.sizes;
const S = sizes[0];
const M = sizes[1] ?? sizes[0];
const base = {
  id: "",
  name: "Load test (temporary)",
  category: category.name,
  gender: "unisex",
  tags: [],
  price: 500,
  description: "",
  images: ["/images/product-1.webp"],
  badge: "",
  color: "#112233",
  active: false,
  stock: Object.fromEntries(sizes.map((s) => [s, 0])),
};
await q(sql`insert into products (id, name, category, price, image, images, color, active)
  values (${PID}, ${base.name}, ${base.category}, 500, '/images/product-1.webp', '{/images/product-1.webp}', '#112233', true)`);
for (const s of sizes) await q(sql`insert into inventory values (${PID}, ${s}, ${s === S ? 3 : 10})`);

let failed = false;
try {
  console.log(`Concurrency against the real database (temporary product ${PID})`);

  const results = await Promise.allSettled(Array.from({ length: 25 }, (_, i) => buy(i, S)));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
  assert.equal(
    results.filter((r) => r.status === "rejected" && (r.reason as { status?: number }).status === 409).length,
    22,
  );
  assert.equal(await stock(S), 0);
  console.log("  ✓ 25 simultaneous checkouts for 3 units → exactly 3 succeed, 22 told sold out");

  const editorOpened = { ...base.stock, [M]: await stock(M) };
  const sales = await Promise.all(Array.from({ length: 4 }, (_, i) => buy(100 + i, M)));
  const [{ updated_at }] = await q(sql`select updated_at from products where id=${PID}`);
  await cat.saveProduct(
    {
      ...base,
      id: PID,
      active: true,
      stock: { ...editorOpened, [S]: 0, [M]: 15 },
      stockBase: { ...editorOpened, [S]: 0 },
      version: new Date(updated_at).toISOString(),
    } as never,
    "loadtest",
  );
  assert.equal(await stock(M), 11);
  console.log("  ✓ staff adds +5 while 4 sell → sales not erased");

  const [{ updated_at: v }] = await q(sql`select updated_at from products where id=${PID}`);
  const version = new Date(v).toISOString();
  const saves = await Promise.allSettled(
    ["A", "B"].map((n) =>
      cat.saveProduct(
        {
          ...base,
          id: PID,
          active: true,
          name: `Load test ${n}`,
          stock: base.stock,
          stockBase: base.stock,
          version,
        } as never,
        n,
      ),
    ),
  );
  assert.equal(saves.filter((s) => s.status === "fulfilled").length, 1);
  console.log("  ✓ two staff saving the same product → one saved, the other asked to reload");

  const paid = sales[0];
  await orders.markOrderPaid(paid.razorpay.orderId, "pay_mock_lt1");
  const refunds = await Promise.allSettled(
    Array.from({ length: 5 }, () => adminOrders.refundOrder(paid.orderId, "loadtest", "test")),
  );
  assert.equal(refunds.filter((r) => r.status === "fulfilled").length, 1);
  console.log("  ✓ 5 simultaneous refunds of one order → exactly 1 refund issued");

  const second = sales[1];
  await orders.markOrderPaid(second.razorpay.orderId, "pay_mock_lt2");
  const req = await team.createRequest("refund", second.orderId, "load test", "loadtest");
  const approvals = await Promise.allSettled(
    Array.from({ length: 5 }, (_, i) =>
      team.decideRequest(req.id, "approved", `admin${i}`, "", (r) =>
        adminOrders.refundOrder(r.targetId, `admin${i}`, "approved"),
      ),
    ),
  );
  assert.equal(approvals.filter((r) => r.status === "fulfilled").length, 1);
  console.log("  ✓ 5 admins approving one request at once → carried out exactly once");

  const third = sales[2];
  await orders.markOrderPaid(third.razorpay.orderId, "pay_mock_lt3");
  const steps = await Promise.allSettled(
    Array.from({ length: 5 }, (_, i) => adminOrders.setOrderStatus(third.orderId, "packed", `staff${i}`)),
  );
  assert.equal(steps.filter((s) => s.status === "fulfilled").length, 1);
  console.log("  ✓ 5 staff marking the same order packed → recorded once");

  assert.equal((await q(sql`select count(*)::int n from inventory where quantity < 0`))[0].n, 0);
  console.log("  ✓ no negative stock anywhere");
} catch (e) {
  failed = true;
  console.log("  ✗", (e as Error).message);
} finally {
  const ids = sql.join(
    (created.length ? created : ["-"]).map((i) => sql`${i}`),
    sql`, `,
  );
  await q(sql`delete from approval_requests where target_id in (${ids})`);
  await q(sql`delete from activity_log where target in (${ids})`);
  await q(sql`delete from orders where id in (${ids})`);
  await q(sql`delete from stock_movements where product_id=${PID}`);
  await q(sql`delete from products where id=${PID}`);
  const [left] = await q(
    sql`select (select count(*) from products where id=${PID})::int p, (select count(*) from orders where customer='Load Test')::int o`,
  );
  console.log(`  · cleaned up (leftover product ${left.p}, orders ${left.o})`);
  await db.$client.end();
  process.exit(failed ? 1 : 0);
}
