// Dashboard, team access, orders and email logic against a throwaway database.
// Run: npm test
import assert from "node:assert/strict";
import { exec, finish, migrate, test } from "./setup.mts";

// Apply migrations with data shaped like the live store before 0006 (old products + admins table).
await migrate(async (file) => {
  if (file.startsWith("0006")) {
    await exec(`
      insert into users (id, email, name) values ('11111111-1111-1111-1111-111111111111','owner@berrys.test','Owner');
      insert into admins (user_id, email) values ('11111111-1111-1111-1111-111111111111','owner@berrys.test');
      insert into products (id,name,category,price,original_price,description,image,badge,color) values
        ('berry-1','Peach set','Co-ord sets',699,899,'','/images/product-1.webp','','#000000'),
        ('berry-2','Meadow dress','Dresses',899,1199,'','/images/product-5.webp','','#000000'),
        ('berry-3','Odd one','Legacy',500,500,'','/images/product-2.webp','','#000000');
      insert into inventory select p, s, 5 from unnest(array['berry-1','berry-2','berry-3']) p, unnest(array['S','M','L','XL']) s;`);
  }
  if (file.startsWith("0018")) {
    await exec(`insert into orders (id, customer, email, phone, address, pincode, subtotal, total, status, expires_at, razorpay_payment_id, refund_id, refunded_at)
      values ('BRY-OLDREFUND', 'Old', 'old@b.co', '9876543210', '1 Road', '560001', 500, 500, 'refunded', now(), 'pay_old', 'rfnd_old', now())`);
  }
  // An offer made before sale prices moved into offers: it came off the selling price.
  if (file.startsWith("0015")) {
    await exec(`insert into offers (name, type, value, scope, targets, starts_at, active)
      values ('Dress week', 'percent', 20, 'category', '{Dresses}', now() - interval '1 minute', true)`);
  }
});

const { getDb } = await import("../db/index.ts");
const { sql } = await import("drizzle-orm");
const db = getDb();
const q = async (s: ReturnType<typeof sql>) => (await db.execute(s)) as unknown as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
type Err = { status?: number; message?: string };

console.log("Migrations");
await test("categories created from products, incl. legacy ones", async () => {
  const names = (await q(sql`select name from categories order by name`)).map((r) => r.name);
  for (const n of ["Co-ord sets", "Dresses", "Legacy"]) assert.ok(names.includes(n), n);
});
await test("admins moved to staff_members with full access; admins table dropped", async () => {
  const staff = await q(sql`select email, role, access_mode, password_hash from staff_members`);
  assert.equal(staff.length, 1);
  assert.equal(staff[0].role, "admin");
  assert.equal(staff[0].access_mode, "full");
  assert.equal(staff[0].password_hash, null);
  assert.equal((await q(sql`select to_regclass('public.admins') as t`))[0].t, null);
});
await test("category rename cascades to products", async () => {
  await q(sql`update categories set name='Legacy pieces' where name='Legacy'`);
  assert.equal((await q(sql`select category from products where id='berry-3'`))[0].category, "Legacy pieces");
});

console.log("Access rules");
const core = await import("../lib/staff-core.ts");
const member = (role: string, accessMode: string, permissions: string[] = [], email = "x@test.in") => ({
  role,
  accessMode,
  permissions,
  email,
});
await test("password hashing: verify right, reject wrong, rules", async () => {
  const h = await core.hashPassword("berrys2026x");
  assert.equal(await core.verifyPassword("berrys2026x", h), true);
  assert.equal(await core.verifyPassword("berrys2026y", h), false);
  assert.equal(await core.verifyPassword("x", null), false);
  assert.ok(core.passwordProblem("short1"));
  assert.ok(core.passwordProblem("onlyletterslong"));
  assert.equal(core.passwordProblem("letters123x"), null);
});
await test("owner can do everything, whatever the row says", () => {
  const owner = member("staff", "manual", [], "Owner@Berrys.test");
  for (const k of ["settings", "team", "content", "delete_records"] as const)
    assert.ok(core.can(owner, k), k);
  assert.ok(core.hasFullAccess(owner));
  assert.ok(core.canManageAdmins(owner));
});
await test("admin with Full access can do everything, but can't manage admins", () => {
  const a = member("admin", "full");
  for (const k of [...core.permissionKeys, ...core.adminAreaKeys]) assert.ok(core.can(a, k), k);
  assert.equal(core.canManageAdmins(a), false);
});
await test("admin with chosen access only gets what was ticked", () => {
  const a = member("admin", "manual", ["orders", "requests"]);
  assert.ok(core.can(a, "orders") && core.can(a, "requests"));
  for (const k of ["settings", "team", "products", "delete_records"] as const)
    assert.equal(core.can(a, k), false, k);
  assert.equal(core.accessSummary(a), "Chosen access (2)");
});
await test("staff Default access = the 10 standard permissions (no website content / admin areas)", () => {
  const s = member("staff", "default");
  assert.deepEqual(core.grantedAccess(s), core.staffDefaultPermissions);
  assert.equal(core.staffDefaultPermissions.length, 10);
  for (const k of ["content", "delete_categories", "settings", "requests"] as const)
    assert.equal(core.can(s, k), false, k);
});
await test("staff with chosen access: ticked shop permissions only, never admin areas", () => {
  const s = member("staff", "manual", ["orders", "settings", "team"]);
  assert.equal(core.can(s, "orders"), true);
  assert.equal(core.can(s, "settings"), false);
  assert.equal(core.can(s, "team"), false);
  assert.equal(core.can(s, "products"), false);
});
await test("dashboard sections map to the access they need", () => {
  assert.equal(core.sectionAccess("/berrys-office-test/settings"), "settings");
  assert.equal(core.sectionAccess("/berrys-office-test/orders/BRY-1"), "orders");
  assert.equal(core.sectionAccess("/berrys-office-test/account"), null);
  assert.equal(core.sectionAccess("/berrys-office-test"), null);
});
await test("ADMIN_PATH is sanitised", () => {
  assert.equal(core.adminPath(), "berrys-office-test");
  assert.equal(core.adminHref("orders"), "/berrys-office-test/orders");
});

console.log("Catalogue");
const { bestPrice } = await import("../lib/offers.ts");
const o = (x: object) => ({
  id: "",
  name: "x",
  targets: [],
  productId: null,
  excluded: [],
  stacked: [],
  replaced: [],
  endsAt: null,
  ...x,
});
// Price + label (end time checked separately).
const pl = (r: { price: number; offer: string }) => ({ price: r.price, offer: r.offer });
await test("pricing: best offer wins from the MRP, never below ₹1", () => {
  const base = { id: "a", category: "Dresses", price: 1000 };
  const offers = [
    o({ name: "10% all", type: "percent", value: 10, scope: "all" }),
    o({ name: "₹250 dresses", type: "flat", value: 250, scope: "category", targets: ["Dresses"] }),
    o({ name: "other", type: "percent", value: 50, scope: "product", targets: ["zzz"] }),
  ];
  assert.deepEqual(pl(bestPrice(base, offers as never)), { price: 750, offer: "₹250 dresses" });
  assert.equal(bestPrice({ ...base, category: "Tops" }, offers as never).price, 900);
  assert.equal(bestPrice(base, [o({ type: "flat", value: 99999, scope: "all" })] as never).price, 1);
  assert.deepEqual(pl(bestPrice(base, [] as never)), { price: 1000, offer: "" });
});
await test("pricing: own sale price vs offers — better wins, Skip, Apply both", () => {
  const base = { id: "a", category: "Dresses", price: 1000 };
  const sale = o({
    name: "Special price",
    type: "price",
    value: 800,
    scope: "product",
    targets: ["a"],
    productId: "a",
  });
  const all10 = (x: object = {}) => o({ name: "10% all", type: "percent", value: 10, scope: "all", ...x });
  const all30 = (x: object = {}) => o({ name: "30% all", type: "percent", value: 30, scope: "all", ...x });
  assert.deepEqual(pl(bestPrice(base, [sale] as never)), { price: 800, offer: "Special price" });
  // Undecided: each worked out on its own, the lower one wins.
  assert.deepEqual(pl(bestPrice(base, [sale, all10()] as never)), { price: 800, offer: "Special price" });
  assert.deepEqual(pl(bestPrice(base, [sale, all30()] as never)), { price: 700, offer: "30% all" });
  // Skip: the offer leaves this product on its sale price.
  assert.deepEqual(pl(bestPrice(base, [sale, all30({ excluded: ["a"] })] as never)), {
    price: 800,
    offer: "Special price",
  });
  // Apply both: 10% off the ₹800 sale price.
  assert.deepEqual(pl(bestPrice(base, [sale, all10({ stacked: ["a"] })] as never)), {
    price: 720,
    offer: "Special price + 10% all",
  });
  // Replace: while the offer runs it is used instead of the sale price (30% off the ₹1000 MRP)…
  assert.deepEqual(pl(bestPrice(base, [sale, all10({ replaced: ["a"] })] as never)), {
    price: 900,
    offer: "10% all",
  });
  // …and once it ends (no longer live), the sale price is back.
  assert.deepEqual(pl(bestPrice(base, [sale] as never)), { price: 800, offer: "Special price" });
  // End time: the earliest end of what made the price.
  const tonight = new Date(Date.now() + 3_600_000);
  const later = new Date(Date.now() + 7_200_000);
  assert.equal(bestPrice(base, [all30({ endsAt: tonight })] as never).endsAt?.getTime(), tonight.getTime());
  assert.equal(
    bestPrice(base, [
      { ...sale, endsAt: later },
      all10({ stacked: ["a"], endsAt: tonight }),
    ] as never).endsAt?.getTime(),
    tonight.getTime(),
  );
  assert.equal(bestPrice(base, [sale] as never).endsAt, null);
  // Exactly the sums a customer expects: ₹100 with 10% off = ₹90.
  assert.equal(bestPrice({ id: "b", category: "X", price: 100 }, [all10()] as never).price, 90);
});
const cat = await import("../lib/admin/catalog.ts");
const store = await import("../lib/store-data.ts");
await test("migration: selling price → own sale price; MRP kept; older offers keep today's prices", async () => {
  const [p2] = await q(sql`select price from products where id='berry-2'`);
  assert.equal(p2.price, 1199);
  const [own] = await q(sql`select name, type, value, active from offers where product_id='berry-2'`);
  assert.deepEqual({ ...own }, { name: "Special price", type: "price", value: 899, active: true });
  assert.equal((await q(sql`select 1 from offers where product_id='berry-3'`)).length, 0); // no discount → no sale price
  const [dw] = await q(sql`select stacked from offers where name='Dress week'`);
  assert.deepEqual(dw.stacked, ["berry-2"]);
  await q(sql`update categories set sizes='{2-3Y,3-4Y}' where name='Dresses'`);
  const p = await store.getProduct("berry-2");
  assert.deepEqual(p!.sizes.slice(0, 2), ["2-3Y", "3-4Y"]);
  assert.equal(p!.price, 719); // 20% off the ₹899 sale price, as before
  assert.equal(p!.originalPrice, 1199);
  assert.equal(p!.offer, "Special price + Dress week");
});
await test("saving an offer asks about products with their own sale price", async () => {
  const offer = {
    name: "Co-ord 50",
    type: "percent" as const,
    value: 50,
    scope: "category" as const,
    targets: ["Co-ord sets"],
    startsAt: new Date(Date.now() - 60000),
    endsAt: null,
    active: true,
  };
  // berry-1: MRP ₹899, sale ₹699.
  await assert.rejects(
    cat.saveOffer(offer),
    (e: Err) => e.status === 409 && /Peach set/.test(e.message ?? ""),
  );
  const { offer: saved } = await cat.saveOffer(offer, { "berry-1": "skip" });
  assert.equal((await store.getProduct("berry-1"))!.price, 699);
  await cat.saveOffer({ ...offer, id: saved.id }, { "berry-1": "both" });
  assert.equal((await store.getProduct("berry-1"))!.price, 349); // 50% off ₹699
  // Editing again keeps the earlier choice without asking.
  await cat.saveOffer({ ...offer, id: saved.id, name: "Co-ord half" });
  assert.equal((await store.getProduct("berry-1"))!.offer, "Special price + Co-ord half");
  const { replaced } = await cat.saveOffer({ ...offer, id: saved.id }, { "berry-1": "replace" });
  assert.equal(replaced, 1);
  // Replace keeps the sale price; the offer is used instead while it runs.
  assert.equal((await q(sql`select 1 from offers where product_id='berry-1'`)).length, 1);
  assert.equal((await store.getProduct("berry-1"))!.price, 449); // 50% off the ₹899 MRP
  // Offer ends → the sale price is back.
  await q(sql`update offers set ends_at = now() - interval '1 second' where id=${saved.id}`);
  assert.equal((await store.getProduct("berry-1"))!.price, 699);
  await cat.deleteOffer(saved.id);
  assert.equal((await store.getProduct("berry-1"))!.price, 699);
});
await test("product editor: choices for offers that also cover it (Skip / Apply both / Replace / Lower wins)", async () => {
  const { offer: o30 } = await cat.saveOffer(
    {
      name: "Co-ord 30",
      type: "percent",
      value: 30,
      scope: "category",
      targets: ["Co-ord sets"],
      startsAt: new Date(Date.now() - 60000),
      endsAt: new Date(Date.now() + 3_600_000),
      active: true,
    },
    { "berry-1": "skip" },
  );
  const covering = await cat.offersCovering({ id: "berry-1", category: "Co-ord sets" });
  assert.deepEqual(
    covering.map((c) => [c.name, c.choice]),
    [["Co-ord 30", "skip"]],
  );
  const row = (await cat.getAdminProduct("berry-1"))!;
  const save = (choice: string) =>
    cat.saveProduct(
      {
        ...(row as never as object),
        id: "berry-1",
        price: row.basePrice,
        salePrice: 699,
        saleStartsAt: "",
        saleEndsAt: "",
        version: undefined,
        stockBase: undefined,
        offerChoices: { [o30.id]: choice },
      } as never,
      "tester",
    );
  const price = async () => (await store.getProduct("berry-1"))!;
  assert.equal((await price()).price, 699); // skip
  await save("both");
  assert.equal((await price()).price, 489); // 30% off ₹699
  assert.ok((await price()).offerEndsAt); // the offer's end time reaches the shop
  await save("replace");
  assert.equal((await price()).price, 629); // 30% off the ₹899 MRP
  await save("better");
  assert.equal((await price()).price, 629); // lower of ₹699 and ₹629
  const [r] = await q(sql`select excluded, stacked, replaced from offers where id=${o30.id}`);
  assert.deepEqual([r.excluded, r.stacked, r.replaced], [[], [], []]);
  await cat.deleteOffer(o30.id);
});
await test("saveProduct logs stock changes; search finds tags", async () => {
  const id = await cat.saveProduct(
    {
      id: "",
      name: "Rainbow Tee",
      category: "Dresses",
      gender: "girls",
      tags: ["rainbow", "cotton"],
      price: 600,
      salePrice: 500,
      saleStartsAt: "",
      saleEndsAt: "",
      description: "",
      images: ["/images/product-3.webp"],
      badge: "",
      color: "#112233",
      active: true,
      stock: { "2-3Y": 4, "3-4Y": 0 },
    } as never,
    "tester",
  );
  const moves = await q(sql`select change from stock_movements where product_id=${id}`);
  assert.deepEqual(
    moves.map((m) => m.change),
    [4],
  );
  assert.ok((await store.queryProducts({ q: "cotton" })).products.some((x: { id: string }) => x.id === id));
  const [own] = await q(sql`select value from offers where product_id=${id}`);
  assert.equal(own.value, 500);
  // Dress week (20%) covers it but nobody chose: it gets the better of ₹500 and ₹480.
  assert.equal((await store.getProduct(id))!.price, 480);
  // Clearing the sale price removes its offer row (one record, edited from either place).
  const row = await cat.getAdminProduct(id);
  await cat.saveProduct(
    {
      ...(row as never as object),
      id,
      price: row!.basePrice, // the MRP (row.price is what customers pay today)
      salePrice: 0,
      saleStartsAt: "",
      saleEndsAt: "",
      version: undefined,
      stockBase: undefined,
      stock: { "2-3Y": 4, "3-4Y": 0 },
    } as never,
    "tester",
  );
  assert.equal((await q(sql`select 1 from offers where product_id=${id}`)).length, 0);
  assert.equal((await store.getProduct(id))!.price, 480);
});
await test("adjustStock can't go negative", async () => {
  await cat.adjustStock("berry-1", "S", -2, "tester", "damaged");
  await assert.rejects(cat.adjustStock("berry-1", "S", -50, "tester", ""));
  assert.equal(
    (await q(sql`select quantity from inventory where product_id='berry-1' and size='S'`))[0].quantity,
    3,
  );
});
await test("category with products can't be deleted (or requested for deletion)", async () => {
  const [c] = await q(sql`select id from categories where name='Dresses'`);
  await assert.rejects(cat.deleteCategory(c.id), (e: Err) => e.status === 409);
  await assert.rejects(cat.assertCategoryDeletable(c.id), (e: Err) => e.status === 409);
});

console.log("Orders");
const orders = await import("../lib/orders.ts");
const adminOrders = await import("../lib/admin/orders.ts");
const { checkoutSchema } = await import("../lib/validation.ts");
let orderId = "";
await test("checkout charges the offer price; history + stock movement recorded", async () => {
  const o = await orders.createPendingOrder(
    checkoutSchema.parse({
      items: [{ productId: "berry-2", size: "M", quantity: 1 }],
      customer: "Asha",
      email: "a@b.co",
      phone: "9876543210",
      address: "12 Lake Road, Bengaluru",
      pincode: "560038",
    }),
    null,
    { mode: "demo", ready: true },
  );
  assert.equal(o.total, 719);
  await orders.markOrderPaid(o.razorpay.orderId, "pay_mock_1");
  const ev = (await adminOrders.orderHistory(o.orderId)).map((e: { status: string }) => e.status);
  assert.deepEqual(ev.sort(), ["paid", "pending_payment"]);
  assert.deepEqual(
    (await q(sql`select change from stock_movements where order_id=${o.orderId}`)).map((m) => m.change),
    [-1],
  );
  orderId = o.orderId;
});
await test("Orders badge counts paid orders waiting to be packed", async () => {
  assert.equal(await adminOrders.newOrderCount(), 1);
  await adminOrders.setOrderStatus(orderId, "packed", "tester");
  assert.equal(await adminOrders.newOrderCount(), 0);
});
await test("fulfilment: packed → shipped with timestamps; can't go backwards", async () => {
  await adminOrders.setOrderStatus(orderId, "shipped", "tester");
  await assert.rejects(adminOrders.setOrderStatus(orderId, "packed", "tester"));
  const [o] = await q(sql`select packed_at, shipped_at from orders where id=${orderId}`);
  assert.ok(o.packed_at && o.shipped_at);
});
await test("refund (demo payment): status refunded; shipped order stock not restored", async () => {
  const before = (await q(sql`select quantity from inventory where product_id='berry-2' and size='M'`))[0]
    .quantity;
  const rid = await adminOrders.refundOrder(orderId, "tester", "damaged");
  assert.ok(String(rid).startsWith("rfnd_mock_"));
  assert.equal((await q(sql`select status from orders where id=${orderId}`))[0].status, "refunded");
  assert.equal(
    (await q(sql`select quantity from inventory where product_id='berry-2' and size='M'`))[0].quantity,
    before,
  );
  await assert.rejects(adminOrders.refundOrder(orderId, "tester", "again"));
});

console.log("Prices, offers and shipping at checkout");
{
  const { shippingFor } = await import("../lib/catalog.ts");
  const { updateSettings } = await import("../lib/settings.ts");
  const buy = (items: { productId: string; size: string; quantity: number }[], email: string) =>
    orders.createPendingOrder(
      checkoutSchema.parse({
        items,
        customer: "Price Test",
        email,
        phone: "9876543210",
        address: "12 Lake Road, Bengaluru",
        pincode: "560038",
      }),
      null,
      { mode: "demo", ready: true },
    );
  await test("shipping rule: fee below the threshold, free from it, 0 fee = always free", () => {
    assert.equal(shippingFor(999, { fee: 80, freeAbove: 1000 }), 80);
    assert.equal(shippingFor(1000, { fee: 80, freeAbove: 1000 }), 0);
    assert.equal(shippingFor(50, { fee: 0, freeAbove: 0 }), 0);
    assert.equal(shippingFor(5000, { fee: 60, freeAbove: 0 }), 60);
  });
  await test("checkout: offer price per item, shipping on the discounted total, free above the threshold", async () => {
    await updateSettings({ shippingFee: 80, freeShippingAbove: 1000 }, "tester");
    // berry-2 sells at ₹719 (sale ₹899 + Dress week 20%): one = ₹719 + ₹80 shipping.
    const one = await buy([{ productId: "berry-2", size: "L", quantity: 1 }], "p1@b.co");
    assert.equal(one.total, 799);
    const [o1] = await q(sql`select subtotal, shipping, total from orders where id=${one.orderId}`);
    assert.deepEqual({ ...o1 }, { subtotal: 719, shipping: 80, total: 799 });
    const [item] = await q(sql`select price, quantity from order_items where order_id=${one.orderId}`);
    assert.deepEqual({ ...item }, { price: 719, quantity: 1 });
    // Two = ₹1,438 ≥ ₹1,000 → free shipping.
    const two = await buy([{ productId: "berry-2", size: "XL", quantity: 2 }], "p2@b.co");
    assert.equal(two.total, 1438);
    // The order keeps its prices even if the offer ends before payment.
    await q(sql`update offers set ends_at = now() - interval '1 second' where name='Dress week'`);
    const [still] = await q(sql`select total from orders where id=${one.orderId}`);
    assert.equal(still.total, 799);
    // …while a new checkout now pays the sale price only (₹899 + ₹80).
    const three = await buy([{ productId: "berry-2", size: "L", quantity: 1 }], "p3@b.co");
    assert.equal(three.total, 979);
    await updateSettings({ shippingFee: 0, freeShippingAbove: 0 }, "tester");
  });
  await test("offers only apply between their start and end", async () => {
    const soon = await cat.saveOffer(
      {
        name: "Later",
        type: "percent",
        value: 50,
        scope: "product",
        targets: ["berry-3"],
        startsAt: new Date(Date.now() + 3_600_000),
        endsAt: null,
        active: true,
      },
      {},
    );
    assert.equal((await store.getProduct("berry-3"))!.price, 500); // not started
    await q(sql`update offers set starts_at = now() - interval '1 minute' where id=${soon.offer.id}`);
    assert.equal((await store.getProduct("berry-3"))!.price, 250); // live
    await q(sql`update offers set ends_at = now() - interval '1 second' where id=${soon.offer.id}`);
    assert.equal((await store.getProduct("berry-3"))!.price, 500); // ended
    await q(sql`update offers set ends_at = null, active = false where id=${soon.offer.id}`);
    assert.equal((await store.getProduct("berry-3"))!.price, 500); // switched off
    await cat.deleteOffer(soon.offer.id);
    await q(sql`delete from orders where email in ('p1@b.co','p2@b.co','p3@b.co')`);
  });
}
console.log("Refunds: part, full, requests");
{
  const refundsLib = await import("../lib/refunds.ts");
  const { updateSettings, getSettings } = await import("../lib/settings.ts");
  const stockOf = async (size: string) =>
    (await q(sql`select quantity from inventory where product_id='berry-3' and size=${size}`))[0]
      .quantity as number;
  const paidOrder = async (email: string, payment = "pay_mock_rf_" + email.slice(0, 6)) => {
    const o = await orders.createPendingOrder(
      checkoutSchema.parse({
        items: [
          { productId: "berry-3", size: "S", quantity: 1 },
          { productId: "berry-3", size: "M", quantity: 2 },
        ],
        customer: "Refund Test",
        email,
        phone: "9876543210",
        address: "12 Lake Road, Bengaluru",
        pincode: "560038",
      }),
      null,
      { mode: "demo", ready: true },
    );
    await orders.markOrderPaid(o.razorpay.orderId, payment);
    return o;
  };
  const row = async (id: string) =>
    (await q(sql`select status, refunded_amount, refund_id from orders where id=${id}`))[0];
  const items = async (id: string) =>
    q(
      sql`select id, product_id, size, quantity, price, name from order_items where order_id=${id} order by size`,
    );

  // Plenty of stock for these orders.
  await q(sql`update inventory set quantity = 50 where product_id = 'berry-3'`);
  await test("migration: an old full refund is recorded in order_refunds", async () => {
    const [o] = await q(sql`select refunded_amount from orders where id='BRY-OLDREFUND'`);
    assert.equal(o.refunded_amount, 500);
    const [r] = await q(
      sql`select amount, status, razorpay_refund_id from order_refunds where order_id='BRY-OLDREFUND'`,
    );
    assert.deepEqual({ ...r }, { amount: 500, status: "done", razorpay_refund_id: "rfnd_old" });
  });

  await test("part refund: only that amount, order stays paid, only those pieces back in stock", async () => {
    await updateSettings({ shippingFee: 0, freeShippingAbove: 0 }, "tester");
    const s0 = await stockOf("S");
    const m0 = await stockOf("M");
    const o = await paidOrder("rf1@b.co");
    assert.equal(o.total, 1500);
    const [lineM] = (await items(o.orderId)).filter((i) => i.size === "M");
    await adminOrders.refundAmount(o.orderId, "tester", "one torn", {
      amount: 500,
      items: [
        { orderItemId: lineM.id, productId: "berry-3", name: lineM.name, size: "M", quantity: 1, price: 500 },
      ],
    });
    let r = await row(o.orderId);
    assert.equal(r.status, "paid");
    assert.equal(r.refunded_amount, 500);
    assert.equal(await stockOf("M"), m0 - 2 + 1); // one of the two M back
    assert.equal(await stockOf("S"), s0 - 1);
    // Too much is refused; the rest completes the order and puts back only what's left.
    await assert.rejects(adminOrders.refundAmount(o.orderId, "tester", "x", { amount: 1001 }), (e: Err) =>
      /Only ₹1,000/.test(e.message ?? ""),
    );
    await adminOrders.refundOrder(o.orderId, "tester", "rest");
    r = await row(o.orderId);
    assert.equal(r.status, "refunded");
    assert.equal(r.refunded_amount, 1500);
    assert.ok(String(r.refund_id).startsWith("rfnd_mock_"));
    assert.equal(await stockOf("M"), m0); // no double stock
    assert.equal(await stockOf("S"), s0);
    await assert.rejects(
      adminOrders.refundOrder(o.orderId, "tester", "again"),
      (e: Err) => e.status === 400 || e.status === 409,
    );
  });

  await test("five part refunds at once can't send more than was paid", async () => {
    const o = await paidOrder("rf2@b.co");
    const tries = await Promise.allSettled(
      Array.from({ length: 5 }, () => adminOrders.refundAmount(o.orderId, "tester", "race", { amount: 900 })),
    );
    assert.equal(tries.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal((await row(o.orderId)).refunded_amount, 900);
    assert.equal(
      (await q(sql`select count(*)::int n from order_refunds where order_id=${o.orderId}`))[0].n,
      1,
    );
  });

  await test("approving a customer request pays exactly what they asked for, once", async () => {
    const o = await paidOrder("rf3@b.co");
    const [u] = await q(sql`insert into users (email, name) values ('rf3@b.co','Rf') returning id`);
    await q(sql`update orders set user_id=${u.id} where id=${o.orderId}`);
    const [lineS] = (await items(o.orderId)).filter((i) => i.size === "S");
    const { request } = await refundsLib.createRefundRequest(
      u.id,
      o.orderId,
      {
        wholeOrder: false,
        items: [{ orderItemId: lineS.id, quantity: 1 }],
        reason: "Wrong size",
        details: "",
      },
      await getSettings(),
    );
    assert.equal(request.amount, 500);
    await refundsLib.decideRefundRequest(request.id, "approved", "admin", "");
    const paid = await refundsLib.payRefundRequest(request.id, "admin");
    assert.equal(paid.amount, 500);
    assert.equal((await row(o.orderId)).refunded_amount, 500);
    assert.equal((await row(o.orderId)).status, "paid");
    assert.equal((await refundsLib.payoutsFor([request.id])).get(request.id)?.amount, 500);
    await assert.rejects(refundsLib.payRefundRequest(request.id, "admin"), (e: Err) => e.status === 409);
  });

  await test("if the money can't be sent, the approval keeps the reason and nothing is half-done", async () => {
    // A real (non-demo) payment id with no Razorpay keys in tests: Razorpay can't be reached.
    const o = await paidOrder("rf4@b.co", "pay_REALTEST123");
    const [u] = await q(sql`insert into users (email, name) values ('rf4@b.co','Rf4') returning id`);
    await q(sql`update orders set user_id=${u.id} where id=${o.orderId}`);
    const { request } = await refundsLib.createRefundRequest(
      u.id,
      o.orderId,
      { wholeOrder: true, items: [], reason: "Damaged or defective", details: "" },
      await getSettings(),
    );
    await refundsLib.decideRefundRequest(request.id, "approved", "admin", "");
    await assert.rejects(refundsLib.payRefundRequest(request.id, "admin"));
    const [req] = await q(sql`select status, payout_error from refund_requests where id=${request.id}`);
    assert.equal(req.status, "approved");
    assert.match(req.payout_error, /Razorpay/);
    assert.equal((await row(o.orderId)).refunded_amount, 0);
    assert.equal(
      (await q(sql`select count(*)::int n from order_refunds where order_id=${o.orderId}`))[0].n,
      0,
    );
  });
  // Leave sales as the later analytics checks expect.
  await q(sql`delete from orders where email like 'rf_@b.co' or id = 'BRY-OLDREFUND'`);
  await q(sql`delete from users where email like 'rf_@b.co'`);
}

console.log("Team & requests");
const team = await import("../lib/admin/team.ts");
const [ownerRow] = await q(sql`select id from staff_members where email='owner@berrys.test'`);
let staffId = "";
await test("add staff: email lower-cased, Default access, new-order emails on; duplicate refused", async () => {
  const s = await team.addStaff(
    "Staff@Gmail.com",
    { role: "staff", accessMode: "default", permissions: [], active: true, notifyOrders: true },
    "tester",
  );
  assert.equal(s.email, "staff@gmail.com");
  assert.equal(s.accessMode, "default");
  assert.equal(s.notifyOrders, true);
  staffId = s.id;
  await assert.rejects(
    team.addStaff(
      "staff@gmail.com",
      { role: "staff", accessMode: "default", permissions: [], active: true, notifyOrders: true },
      "t",
    ),
    (e: Err) => e.status === 409,
  );
});
await test("owner can't be removed or demoted, and always keeps full access", async () => {
  await assert.rejects(team.removeStaff(ownerRow.id));
  await assert.rejects(
    team.updateStaff(ownerRow.id, {
      role: "staff",
      accessMode: "default",
      permissions: [],
      active: true,
      name: "",
      notifyOrders: false,
    }),
  );
  await team.updateStaff(ownerRow.id, {
    role: "admin",
    accessMode: "manual",
    permissions: ["orders"],
    active: true,
    name: "Owner",
    notifyOrders: false,
  });
  const [o] = await q(sql`select access_mode, permissions from staff_members where id=${ownerRow.id}`);
  assert.equal(o.access_mode, "full");
  assert.deepEqual(o.permissions, []);
});
await test("without an owner address, the last full-access admin can't lose full access", async () => {
  const saved = process.env.STORE_OWNER_EMAIL;
  process.env.STORE_OWNER_EMAIL = "";
  try {
    const a = await team.addStaff(
      "admin2@test.in",
      { role: "admin", accessMode: "full", permissions: [], active: true, notifyOrders: true },
      "t",
    );
    await q(sql`update staff_members set access_mode='manual' where id=${ownerRow.id}`);
    await assert.rejects(
      team.updateStaff(a.id, {
        role: "admin",
        accessMode: "manual",
        permissions: ["orders"],
        active: true,
        name: "",
        notifyOrders: true,
      }),
      (e: Err) => e.status === 400,
    );
    await q(sql`update staff_members set access_mode='full' where id=${ownerRow.id}`);
    await team.updateStaff(a.id, {
      role: "admin",
      accessMode: "manual",
      permissions: ["orders", "requests"],
      active: true,
      name: "",
      notifyOrders: true,
    });
    const [row] = await q(sql`select access_mode, permissions from staff_members where id=${a.id}`);
    assert.equal(row.access_mode, "manual");
    assert.deepEqual(row.permissions.sort(), ["orders", "requests"]);
    await team.removeStaff(a.id);
  } finally {
    process.env.STORE_OWNER_EMAIL = saved;
  }
});
await test("requests: one pending per target; decide once; returns the saved row", async () => {
  const r = await team.createRequest("delete_product", "berry-3", "old stock", "staff@gmail.com");
  assert.equal(r.type, "delete_product");
  await assert.rejects(
    team.createRequest("delete_product", "berry-3", "again", "x"),
    (e: Err) => e.status === 409,
  );
  await team.decideRequest(r.id, "rejected", "owner", "keep it");
  await assert.rejects(team.decideRequest(r.id, "approved", "owner", ""));
});
await test("category delete request: approving it deletes the empty category", async () => {
  await q(sql`insert into categories (name) values ('Empty one')`);
  const [c] = await q(sql`select id from categories where name='Empty one'`);
  await cat.assertCategoryDeletable(c.id);
  const r = await team.createRequest("delete_category", c.id, "not used", "staff@gmail.com");
  assert.equal(await team.pendingRequestCount(), 1);
  await team.decideRequest(r.id, "approved", "owner", "", (req) => cat.deleteCategory(req.targetId));
  assert.equal((await q(sql`select count(*)::int n from categories where id=${c.id}`))[0].n, 0);
  assert.equal(await team.pendingRequestCount(), 0);
});

console.log("Emails");
const email = await import("../lib/email.ts");
await test("request emails: approvers + owner, never the requester; order-handlers added for customer refunds", async () => {
  await team.addStaff(
    "boss@test.in",
    { role: "admin", accessMode: "full", permissions: [], active: true, notifyOrders: true },
    "t",
  );
  await team.addStaff(
    "helper@test.in",
    { role: "admin", accessMode: "manual", permissions: ["products"], active: true, notifyOrders: true },
    "t",
  );
  await team.addStaff(
    "off@test.in",
    { role: "admin", accessMode: "full", permissions: [], active: false, notifyOrders: true },
    "t",
  );
  const approvers = await email.teamAddresses("approvers");
  assert.deepEqual(approvers.sort(), ["boss@test.in", "owner@berrys.test"]);
  assert.deepEqual((await email.teamAddresses("approvers", "Boss@test.in")).sort(), ["owner@berrys.test"]);
  // Default staff can handle orders, so they hear about customer refund requests too.
  assert.deepEqual((await email.teamAddresses("orders")).sort(), [
    "boss@test.in",
    "owner@berrys.test",
    "staff@gmail.com",
  ]);
});
await test("no email set up: nothing is sent and nothing is counted", async () => {
  assert.equal(email.emailConfigured(), false);
  assert.equal(await email.sendMail({ to: "a@b.co", subject: "x", html: "x", kind: "test" }), false);
  assert.equal((await q(sql`select count(*)::int n from email_sends`))[0].n, 0);
});
await test("emails-sent counter: last 24 h / 7 / 30 days, failures and kinds", async () => {
  await q(sql`insert into email_sends (kind, ok, sent_at) values
    ('sign-in-code', true, now()), ('sign-in-code', true, now() - interval '2 hours'),
    ('team-request', true, now()), ('team-request', false, now()),
    ('status-update', true, now() - interval '3 days'), ('status-update', true, now() - interval '20 days')`);
  const s = await email.emailStats();
  assert.equal(s.day, 3);
  assert.equal(s.week, 4);
  assert.equal(s.month, 5);
  assert.equal(s.failedDay, 1);
  assert.deepEqual(s.byKind, [
    { kind: "sign-in-code", n: 2 },
    { kind: "team-request", n: 1 },
  ]);
});

console.log("Sign in with email");
const codes = await import("../lib/login-codes.ts");
await test("code: 6 digits, wrong refused, right signs in once", async () => {
  const code = await codes.issueLoginCode("a@test.in");
  assert.match(code, /^\d{6}$/);
  const wrong = code === "000000" ? "111111" : "000000";
  assert.equal(await codes.checkLoginCode("a@test.in", wrong), "wrong");
  assert.equal(await codes.checkLoginCode("a@test.in", code), "ok");
  assert.equal(await codes.checkLoginCode("a@test.in", code), "expired");
});
await test("code: 5 wrong tries lock it; a new code replaces the old one", async () => {
  const first = await codes.issueLoginCode("b@test.in");
  const second = await codes.issueLoginCode("b@test.in");
  if (first !== second) assert.equal(await codes.checkLoginCode("b@test.in", first), "wrong");
  for (let i = 0; i < 5; i++) await codes.checkLoginCode("b@test.in", "abcdef");
  assert.equal(await codes.checkLoginCode("b@test.in", second), "expired");
});
await test("code: expired after 10 minutes", async () => {
  const code = await codes.issueLoginCode("c@test.in");
  await q(sql`update email_login_codes set expires_at = now() - interval '1 second' where email='c@test.in'`);
  assert.equal(await codes.checkLoginCode("c@test.in", code), "expired");
});

console.log("Reports & content");
const insights = await import("../lib/admin/insights.ts");
await test("analytics queries run (refunded order excluded)", async () => {
  assert.equal((await insights.salesSummary(30)).orders, 0);
  assert.equal((await insights.salesByDay(7)).length, 7);
  await insights.topProducts(30);
  await insights.trendingProducts();
  await insights.listCustomers({ page: 1 });
  assert.equal((await insights.listPayments({ page: 1 })).refunded, 719);
});
const content = await import("../lib/content.ts");
const settings = await import("../lib/settings.ts");
await test("content and settings: defaults, save, help page override", async () => {
  assert.equal((await content.getContent("home")).shelfTitle, "Find their next favourite.");
  assert.equal((await settings.getSettings()).emailDailyLimit, 500);
  await content.saveContent(
    "help:contact",
    { title: "Contact us", eyebrow: "HI", body: "## Email\n\nhello@x" },
    "t",
  );
  assert.equal((await content.getHelpPage("contact"))!.title, "Contact us");
});

await finish(() => db.$client.end());
