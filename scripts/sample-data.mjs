// Sample catalogue for trying the shop and dashboard with lots of items.
//   node scripts/sample-data.mjs add      → adds categories, products (+stock, sale prices) and offers
//   node scripts/sample-data.mjs remove   → removes everything it added (ids start with "demo-")
// Uses DIRECT_URL / DATABASE_URL from .env. Product photos reuse the bundled /images/product-N.webp.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const postgres = require("postgres");
process.loadEnvFile(path.join(ROOT, ".env"));
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
const sql = postgres(url, { prepare: false, max: 1, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require" });

const NEW_CATEGORIES = [
  { name: "Festive wear", sizes: ["2-3Y", "3-4Y", "4-5Y", "6-7Y", "8-9Y"], description: "Little outfits for big celebrations", sort: 6 },
  { name: "Rompers", sizes: ["0-6M", "6-12M", "12-18M", "18-24M"], description: "Soft one-pieces for the tiniest ones", sort: 7 },
  { name: "Winter wear", sizes: ["S", "M", "L", "XL"], description: "Cosy layers for chilly days", sort: 8 },
];
const OFFER_NAMES = ["Winter warmers", "Festive ₹150 off", "Little steals"];

// Photos that suit each category.
const photos = {
  "Co-ord sets": [1, 2, 3, 4, 6],
  Dresses: [5, 9, 2, 12],
  Sleepwear: [8, 12, 3, 1],
  "Tops & tees": [7, 10, 4, 1],
  Trousers: [11, 6, 3, 4],
  "Festive wear": [5, 9, 2, 6],
  Rompers: [8, 12, 1, 3],
  "Winter wear": [3, 6, 11, 4],
};
const names = {
  "Co-ord sets": ["Sunday picnic", "Lemon grove", "Little sailor", "Berry patch", "Cloud nine", "Garden party"],
  Dresses: ["Daisy chain", "Rosebud twirl", "Bluebell", "Sunset tiered", "Polka party", "Wildflower"],
  Sleepwear: ["Starry night", "Sleepy bear", "Moon & me", "Dream cloud", "Little owl", "Bedtime story"],
  "Tops & tees": ["Rainbow stripe", "Tiny explorer", "Happy camper", "Dino roar", "Sunny days", "Paper plane"],
  Trousers: ["Everyday jogger", "Cargo adventurer", "Linen breeze", "Corduroy comfy", "Denim dungaree", "Pull-on chino"],
  "Festive wear": ["Marigold kurta set", "Lotus lehenga", "Diya sherwani", "Rangoli anarkali", "Jasmine dhoti set"],
  Rompers: ["Bunny hop romper", "Little lamb onesie", "Peapod romper", "Honeybee bodysuit", "Ducky romper"],
  "Winter wear": ["Snowflake sweater", "Teddy fleece jacket", "Cable-knit cardigan", "Puffer vest", "Woolly hoodie"],
};
const suffix = {
  "Co-ord sets": "co-ord set",
  Dresses: "dress",
  Sleepwear: "pyjamas",
  "Tops & tees": "tee",
  Trousers: "",
  "Festive wear": "",
  Rompers: "",
  "Winter wear": "",
};
const tagPool = ["cotton", "summer", "soft", "organic", "breathable", "festive", "cosy", "play", "everyday", "gift", "floral", "stripes"];
const badges = ["", "", "", "NEW ARRIVAL", "BESTSELLER", "LITTLE FAVOURITE", "", "JUST IN"];
const colors = ["#dba58d", "#a1b5c0", "#d3bb72", "#cf9fa8", "#9d7b62", "#a4ad8a", "#e0d9c6", "#824d42", "#99ab82", "#393936", "#c9a0dc", "#f2c57c"];

// Repeatable "random" numbers, so running it twice gives the same catalogue.
let seed = 20261124;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const to9 = (n) => Math.max(99, Math.round(n / 50) * 50 - 1); // shop-style prices: ₹649, ₹749, ₹1,199…
const day = 86_400_000;

async function add() {
  const existing = await sql`select name, sizes from categories`;
  const sizesOf = Object.fromEntries(existing.map((c) => [c.name, c.sizes]));
  const [{ n }] = await sql`select count(*)::int n from products where id like 'demo-%'`;
  if (n) throw new Error(`Sample data is already there (${n} products). Run "remove" first.`);

  await sql.begin(async (tx) => {
    for (const c of NEW_CATEGORIES) {
      if (!sizesOf[c.name])
        await tx`insert into categories (name, description, image, sizes, sort_order, active) values (${c.name}, ${c.description}, '', ${c.sizes}, ${c.sort}, true)`;
      sizesOf[c.name] = sizesOf[c.name] ?? c.sizes;
    }

    const made = [];
    let i = 0;
    for (const [category, list] of Object.entries(names)) {
      for (const base of list) {
        i++;
        const name = suffix[category] ? `${base} ${suffix[category]}` : base;
        const id = `demo-${slug(base)}`;
        const mrp = to9(category === "Festive wear" ? between(1299, 2499) : category === "Rompers" ? between(449, 899) : between(549, 1499));
        const gender = category === "Dresses" ? "girls" : pick(["girls", "boys", "unisex", "unisex"]);
        const pool = photos[category];
        // Most get 3–4 photos (gallery), some just 1–2.
        const want = i % 3 === 2 ? between(1, 2) : between(3, 4);
        const imgs = [...pool].sort(() => rnd() - 0.5).slice(0, want).map((p) => `/images/product-${p}.webp`);
        const tags = [...new Set([pick(tagPool), pick(tagPool), pick(tagPool)])].slice(0, between(1, 3));
        const created = new Date(Date.now() - between(0, 45) * day - between(0, 23) * 3_600_000);
        const active = i % 19 !== 0; // a couple hidden, to see that state too
        await tx`insert into products (id, name, category, gender, tags, images, image, price, description, badge, color, active, created_at, updated_at)
          values (${id}, ${name}, ${category}, ${gender}, ${tags}, ${imgs}, ${imgs[0]}, ${mrp},
            ${`A ${tags[0]} ${category.toLowerCase()} favourite, made for play and easy washing.`},
            ${pick(badges)}, ${pick(colors)}, ${active}, ${created}, ${created})`;

        // Stock: mostly healthy, some running low, a few sold out completely.
        const soldOutAll = i % 13 === 0;
        for (const size of sizesOf[category]) {
          const q = soldOutAll ? 0 : rnd() < 0.15 ? 0 : rnd() < 0.2 ? between(1, 3) : between(4, 30);
          await tx`insert into inventory (product_id, size, quantity) values (${id}, ${size}, ${q})`;
          if (q) await tx`insert into stock_movements (product_id, size, change, reason, actor, note) values (${id}, ${size}, ${q}, 'restock', 'sample data', 'Sample data')`;
        }

        // Own sale price on ~40%: some with an end date, one scheduled, one switched off.
        if (rnd() < 0.42) {
          const sale = to9(mrp * (1 - between(10, 35) / 100));
          const kind = i % 7;
          const startsAt = kind === 3 ? new Date(Date.now() + 2 * day) : created;
          const endsAt = kind === 1 || kind === 4 ? new Date(Date.now() + between(3, 12) * day) : null;
          await tx`insert into offers (name, type, value, scope, targets, starts_at, ends_at, active, product_id)
            values ('Special price', 'price', ${sale}, 'product', ${[id]}, ${startsAt}, ${endsAt}, ${kind !== 5}, ${id})`;
          made.push({ id, category, sale: true });
        } else made.push({ id, category, sale: false });
      }
    }

    // Offers. Products that have their own sale price get an explicit choice.
    const inCat = (c) => made.filter((m) => m.category === c);
    const winter = inCat("Winter wear").filter((m) => m.sale).map((m) => m.id);
    await tx`insert into offers (name, type, value, scope, targets, starts_at, ends_at, active, stacked, excluded)
      values ('Winter warmers', 'percent', 15, 'category', ${["Winter wear"]}, ${new Date(Date.now() - day)}, ${new Date(Date.now() + 10 * day)}, true,
        ${winter.slice(0, 1)}, ${winter.slice(1)})`;
    const festive = inCat("Festive wear").filter((m) => m.sale).map((m) => m.id);
    await tx`insert into offers (name, type, value, scope, targets, starts_at, ends_at, active, replaced, excluded)
      values ('Festive ₹150 off', 'flat', 150, 'category', ${["Festive wear"]}, ${new Date(Date.now() - 2 * day)}, ${new Date(Date.now() + 5 * day)}, true,
        ${festive.slice(0, 1)}, ${festive.slice(1)})`;
    const steals = made.filter((m) => !m.sale).slice(0, 30).filter((_, k) => k % 6 === 0).map((m) => m.id);
    await tx`insert into offers (name, type, value, scope, targets, starts_at, ends_at, active)
      values ('Little steals', 'percent', 25, 'product', ${steals}, ${new Date(Date.now() + day)}, ${new Date(Date.now() + 8 * day)}, true)`;

    console.log(`Added ${NEW_CATEGORIES.length} categories, ${made.length} products (${made.filter((m) => m.sale).length} with a sale price) and ${OFFER_NAMES.length} offers.`);
  });
}

async function remove() {
  await sql.begin(async (tx) => {
    const [o] = await tx`delete from offers where name = any(${OFFER_NAMES}) and product_id is null returning 1`.then((r) => [r.count]);
    // Sale prices go with their products (foreign key); also drop them from other offers' lists.
    await tx`update offers set
      targets = array(select t from unnest(targets) t where t not like 'demo-%'),
      excluded = array(select t from unnest(excluded) t where t not like 'demo-%'),
      stacked = array(select t from unnest(stacked) t where t not like 'demo-%'),
      replaced = array(select t from unnest(replaced) t where t not like 'demo-%')`;
    await tx`delete from stock_movements where product_id like 'demo-%'`;
    const p = await tx`delete from products where id like 'demo-%' returning id`;
    const c = await tx`delete from categories c where name = any(${NEW_CATEGORIES.map((x) => x.name)})
      and not exists (select 1 from products p where p.category = c.name) returning name`;
    console.log(`Removed ${p.length} products, ${o} offers and ${c.length} categories.`);
  });
}

try {
  const cmd = process.argv[2];
  if (cmd === "add") await add();
  else if (cmd === "remove") await remove();
  else console.log('Usage: node scripts/sample-data.mjs add | remove');
} finally {
  await sql.end();
}
