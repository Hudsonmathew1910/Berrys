import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { HttpError } from "@/lib/http-error";
import { hydrateProducts } from "@/lib/store-data";
import type { ProductInput } from "@/lib/validation";
import { fromIndiaInput } from "@/lib/catalog";
import { SALE_OFFER_NAME } from "@/lib/offers";

const { products, inventory, categories, stockMovements, offers } = schema;
export const PAGE_SIZE = 20;
const likeTerm = (q: string) => `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;

// ---------------------------------------------------------------- products

export async function listAdminProducts(f: {
  q?: string;
  category?: string;
  status?: string;
  page: number;
  perPage?: number;
}) {
  const size = Math.min(Math.max(f.perPage ?? PAGE_SIZE, 1), 500);
  const where: SQL[] = [];
  if (f.q) {
    const t = likeTerm(f.q);
    where.push(
      or(
        ilike(products.name, t),
        ilike(products.id, t),
        sql`exists (select 1 from unnest(${products.tags}) x where x ilike ${t})`,
      )!,
    );
  }
  if (f.category) where.push(eq(products.category, f.category));
  if (f.status === "active") where.push(eq(products.active, true));
  if (f.status === "hidden") where.push(eq(products.active, false));
  if (f.status === "out")
    where.push(
      sql`not exists (select 1 from ${inventory} v where v.product_id = ${products.id} and v.quantity > 0)`,
    );
  const db = getDb();
  const [[{ total }], rows] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(products)
      .where(and(...where)),
    db
      .select()
      .from(products)
      .where(and(...where))
      .orderBy(desc(products.updatedAt))
      .limit(size)
      .offset((f.page - 1) * size),
  ]);
  const hydrated = await hydrateProducts(rows);
  return {
    rows: hydrated.map((p) => ({ ...p, active: rows.find((r) => r.id === p.id)!.active })),
    total,
    pages: Math.max(1, Math.ceil(total / size)),
  };
}

export async function getAdminProduct(id: string) {
  const rows = await getDb().select().from(products).where(eq(products.id, id)).limit(1);
  if (!rows[0]) return null;
  const [p] = await hydrateProducts(rows);
  const [sale] = await getDb().select().from(offers).where(eq(offers.productId, id)).limit(1);
  return {
    ...p,
    active: rows[0].active,
    version: rows[0].updatedAt.toISOString(),
    /** The product's own sale price (an offer), if it has one — live, scheduled, ended or switched off. */
    sale: sale
      ? { price: sale.value, startsAt: sale.startsAt, endsAt: sale.endsAt, active: sale.active }
      : null,
  };
}

/** Create/update a product; stock differences are logged as "adjust" movements. */
export async function saveProduct(input: ProductInput, actor: string) {
  const db = getDb();
  const [cat] = await db.select().from(categories).where(eq(categories.name, input.category)).limit(1);
  if (!cat) throw new HttpError(400, "Choose a valid category.");
  const id = input.id || `${slug(input.name)}-${crypto.randomUUID().slice(0, 6)}`;
  // The sale price and its dates (India time). Checked before anything is written.
  const sale = input.salePrice > 0 ? saleWindow(input) : null;
  await db.transaction(async (tx) => {
    if (input.id) {
      // Lock the row so two staff saving at once are applied one after the other.
      const [existing] = await tx.select().from(products).where(eq(products.id, input.id)).for("update");
      if (!existing) throw new HttpError(404, "This product no longer exists.");
      if (input.version && existing.updatedAt.toISOString() !== input.version) {
        throw new HttpError(
          409,
          "Someone else saved this product after you opened it. Reload the page to see their changes, then edit again.",
        );
      }
    }
    const values = {
      name: input.name,
      category: input.category,
      gender: input.gender,
      tags: [...new Set(input.tags)],
      price: input.price,
      description: input.description,
      images: input.images,
      image: input.images[0],
      badge: input.badge.toUpperCase(),
      color: input.color,
      active: input.active,
      updatedAt: new Date(),
    };
    await tx
      .insert(products)
      .values({ id, ...values })
      .onConflictDoUpdate({ target: products.id, set: values });
    // Rows are locked so concurrent checkouts wait for this save (and vice versa).
    const current = await tx.select().from(inventory).where(eq(inventory.productId, id)).for("update");
    for (const size of cat.sizes) {
      const before = current.find((c) => c.size === size)?.quantity ?? 0;
      // Apply only what the staff member changed in the form. If customers bought
      // some meanwhile, those sales stay counted (never below zero).
      const base = input.stockBase?.[size] ?? before;
      const wanted = input.stock[size] ?? 0;
      const next = Math.max(0, before + (wanted - base));
      if (current.some((c) => c.size === size)) {
        if (next !== before) {
          await tx
            .update(inventory)
            .set({ quantity: next })
            .where(and(eq(inventory.productId, id), eq(inventory.size, size)));
        }
      } else {
        await tx.insert(inventory).values({ productId: id, size, quantity: next });
      }
      if (next !== before) {
        await tx.insert(stockMovements).values({
          productId: id,
          size,
          change: next - before,
          reason: input.id ? "adjust" : "restock",
          actor,
          note: input.id ? "Product edited" : "New product",
        });
      }
    }
    // The sale price is the product's own offer: one row, edited from here or from Offers.
    if (sale) {
      const values = { value: input.salePrice, startsAt: sale.startsAt, endsAt: sale.endsAt };
      // On/off is kept as it is (switched under Offers → Sale prices); a new sale price starts on.
      await tx
        .insert(offers)
        .values({
          name: SALE_OFFER_NAME,
          type: "price",
          scope: "product",
          targets: [id],
          productId: id,
          active: true,
          ...values,
        })
        .onConflictDoUpdate({ target: offers.productId, set: values });
    } else {
      await tx.delete(offers).where(eq(offers.productId, id));
    }
  });
  return id;
}

/** Sale start (empty = now) and end (empty = no end) from India-time inputs. */
function saleWindow(input: Pick<ProductInput, "saleStartsAt" | "saleEndsAt">) {
  const startsAt = fromIndiaInput(input.saleStartsAt) ?? new Date();
  const endsAt = fromIndiaInput(input.saleEndsAt);
  if (Number.isNaN(startsAt.getTime()) || (endsAt && Number.isNaN(endsAt.getTime())))
    throw new HttpError(400, "Check the sale dates.");
  if (endsAt && endsAt <= startsAt) throw new HttpError(400, "The sale must end after it starts.");
  return { startsAt, endsAt };
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "product";

export async function setProductActive(id: string, active: boolean) {
  const [p] = await getDb()
    .update(products)
    .set({ active, updatedAt: new Date() })
    .where(eq(products.id, id))
    .returning({ name: products.name });
  if (!p) throw new HttpError(404, "Product not found.");
  return p.name;
}

/** Permanent delete. Past orders keep their own copy of name/price. */
export async function deleteProduct(id: string) {
  const [p] = await getDb().delete(products).where(eq(products.id, id)).returning({ name: products.name });
  if (!p) throw new HttpError(404, "Product not found.");
  // Its own sale price goes with it (foreign key); remove it from every other offer's lists too.
  await getDb()
    .update(offers)
    .set({
      targets: sql`case when ${offers.scope} = 'product' then array_remove(${offers.targets}, ${id}) else ${offers.targets} end`,
      excluded: sql`array_remove(${offers.excluded}, ${id})`,
      stacked: sql`array_remove(${offers.stacked}, ${id})`,
    })
    .where(
      sql`${id} = any(${offers.targets}) or ${id} = any(${offers.excluded}) or ${id} = any(${offers.stacked})`,
    );
  return p.name;
}

// ---------------------------------------------------------------- categories

export async function listCategoriesWithCounts() {
  const db = getDb();
  const [cats, counts] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)),
    db
      .select({ name: products.category, n: sql<number>`count(*)::int` })
      .from(products)
      .groupBy(products.category),
  ]);
  return cats.map((c) => ({ ...c, products: counts.find((x) => x.name === c.name)?.n ?? 0 }));
}

export async function saveCategory(data: {
  id?: string;
  name: string;
  description: string;
  image: string;
  sizes: string[];
  sortOrder: number;
  active: boolean;
}) {
  const db = getDb();
  const values = {
    name: data.name,
    description: data.description,
    image: data.image,
    sizes: data.sizes,
    sortOrder: data.sortOrder,
    active: data.active,
  };
  try {
    if (data.id) {
      return await db.transaction(async (tx) => {
        const [old] = await tx.select().from(categories).where(eq(categories.id, data.id!)).for("update");
        if (!old) throw new HttpError(404, "Category not found.");
        // Products follow a rename by themselves (foreign key); offers and home banners store the name too.
        const [c] = await tx.update(categories).set(values).where(eq(categories.id, data.id!)).returning();
        if (old.name !== c.name) {
          await tx
            .update(offers)
            .set({ targets: sql`array_replace(${offers.targets}, ${old.name}, ${c.name})` })
            .where(eq(offers.scope, "category"));
          await tx.execute(
            sql`update site_content set value = jsonb_set(value, '{items}', (
              select coalesce(jsonb_agg(case when b->>'category' = ${old.name}
                then jsonb_set(b, '{category}', to_jsonb(${c.name}::text)) else b end), '[]'::jsonb)
              from jsonb_array_elements(value->'items') b)) where key = 'banners'`,
          );
        }
        return c;
      });
    }
    const [c] = await db.insert(categories).values(values).returning();
    return c;
  } catch (e) {
    if (
      (e as { cause?: { code?: string } }).cause?.code === "23505" ||
      (e as { code?: string }).code === "23505"
    ) {
      throw new HttpError(409, "A category with that name already exists.");
    }
    throw e;
  }
}

export async function setCategoryActive(id: string, active: boolean) {
  const [c] = await getDb().update(categories).set({ active }).where(eq(categories.id, id)).returning();
  if (!c) throw new HttpError(404, "Category not found.");
  return c.name;
}

/** Current quantity of one size (0 if there's no row yet). */
export async function stockOf(productId: string, size: string) {
  const [row] = await getDb()
    .select({ q: inventory.quantity })
    .from(inventory)
    .where(and(eq(inventory.productId, productId), eq(inventory.size, size)))
    .limit(1);
  return row?.q ?? 0;
}

/** Throws if the category doesn't exist or still has products. */
export async function assertCategoryDeletable(id: string) {
  const db = getDb();
  const [cat] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!cat) throw new HttpError(404, "Category not found.");
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.category, cat.name));
  if (n > 0)
    throw new HttpError(409, `Move or delete its ${n} products first, or hide the category instead.`);
  return cat;
}

export async function deleteCategory(id: string) {
  const cat = await assertCategoryDeletable(id);
  await getDb().delete(categories).where(eq(categories.id, id));
  // Don't leave offers pointing at a category that no longer exists.
  await getDb()
    .update(offers)
    .set({ targets: sql`array_remove(${offers.targets}, ${cat.name})` })
    .where(eq(offers.scope, "category"));
  return cat.name;
}

// ---------------------------------------------------------------- stock

export async function lowStock(threshold = 3, limit = 50) {
  const rows = await getDb()
    .select({
      productId: inventory.productId,
      size: inventory.size,
      quantity: inventory.quantity,
      name: products.name,
      image: products.image,
      category: products.category,
    })
    .from(inventory)
    .innerJoin(products, eq(products.id, inventory.productId))
    .innerJoin(categories, eq(categories.name, products.category))
    .where(
      and(
        eq(products.active, true),
        sql`${inventory.quantity} <= ${threshold}`,
        sql`${inventory.size} = any(${categories.sizes})`,
      ),
    )
    .orderBy(asc(inventory.quantity), asc(products.name))
    .limit(limit);
  return rows;
}

/** Totals for the Stock page: units on hand and how many sizes are sold out or running low (visible products). */
export async function stockSummary(threshold = 3) {
  const [r] = await getDb()
    .select({
      units: sql<number>`coalesce(sum(${inventory.quantity}), 0)::int`,
      soldOut: sql<number>`count(*) filter (where ${inventory.quantity} = 0)::int`,
      low: sql<number>`count(*) filter (where ${inventory.quantity} between 1 and ${threshold})::int`,
      products: sql<number>`count(distinct ${products.id})::int`,
    })
    .from(inventory)
    .innerJoin(products, eq(products.id, inventory.productId))
    .innerJoin(categories, eq(categories.name, products.category))
    .where(and(eq(products.active, true), sql`${inventory.size} = any(${categories.sizes})`));
  return r;
}

export async function listMovements(f: { productId?: string; page: number }) {
  const where = f.productId ? eq(stockMovements.productId, f.productId) : undefined;
  const db = getDb();
  const [[{ total }], rows] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(stockMovements)
      .where(where),
    db
      .select({ m: stockMovements, name: products.name })
      .from(stockMovements)
      .leftJoin(products, eq(products.id, stockMovements.productId))
      .where(where)
      .orderBy(desc(stockMovements.createdAt))
      .limit(PAGE_SIZE)
      .offset((f.page - 1) * PAGE_SIZE),
  ]);
  return { rows, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Add or remove stock for one size, with a reason. */
export async function adjustStock(
  productId: string,
  size: string,
  change: number,
  actor: string,
  note: string,
) {
  await getDb().transaction(async (tx) => {
    const [row] = await tx
      .insert(inventory)
      .values({ productId, size, quantity: Math.max(0, change) })
      .onConflictDoUpdate({
        target: [inventory.productId, inventory.size],
        set: { quantity: sql`${inventory.quantity} + ${change}` },
      })
      .returning();
    if (row.quantity < 0) throw new HttpError(400, "Stock can’t go below zero.");
    await tx.insert(stockMovements).values({
      productId,
      size,
      change,
      reason: change > 0 ? "restock" : "adjust",
      actor,
      note,
    });
  });
}

// ---------------------------------------------------------------- offers

/** Category / store / product offers (not the products' own sale prices). */
export async function listOffers() {
  return getDb()
    .select()
    .from(offers)
    .where(isNull(offers.productId))
    .orderBy(desc(offers.active), desc(offers.startsAt));
}

/** Every product's own sale price that hasn't ended (live, scheduled or switched off), with its MRP. */
export async function listSalePrices() {
  const rows = await getDb()
    .select({
      offerId: offers.id,
      productId: products.id,
      name: products.name,
      category: products.category,
      image: products.image,
      mrp: products.price,
      sale: offers.value,
      startsAt: offers.startsAt,
      endsAt: offers.endsAt,
      active: offers.active,
    })
    .from(offers)
    .innerJoin(products, eq(products.id, offers.productId))
    .orderBy(asc(products.category), asc(products.name));
  return rows;
}
export type SalePrice = Awaited<ReturnType<typeof listSalePrices>>[number];

export type ConflictChoice = "replace" | "skip" | "both";

/** Does a category / store / product offer cover this product? */
const covers = (o: { scope: string; targets: string[] }, p: { productId: string; category: string }) =>
  o.scope === "all" ||
  (o.scope === "category" && o.targets.includes(p.category)) ||
  (o.scope === "product" && o.targets.includes(p.productId));

/**
 * Saves a category / store / product offer. Products it covers that have their own (not ended) sale
 * price need a choice — from `decisions` or from this offer's earlier choices:
 * replace = their sale price is removed · skip = this offer leaves them alone · both = it comes off their sale price.
 */
export async function saveOffer(
  data: {
    id?: string;
    name: string;
    type: "percent" | "flat";
    value: number;
    scope: "all" | "category" | "product";
    targets: string[];
    startsAt: Date;
    endsAt: Date | null;
    active: boolean;
  },
  decisions: Record<string, ConflictChoice> = {},
) {
  const { id, ...values } = data;
  return getDb().transaction(async (tx) => {
    const prev = id ? (await tx.select().from(offers).where(eq(offers.id, id)).for("update"))[0] : null;
    if (id && !prev) throw new HttpError(404, "Offer not found.");
    if (prev?.productId)
      throw new HttpError(400, "Change a product’s sale price on the product or under Sale prices.");

    const now = new Date();
    const sales = (
      await tx
        .select({
          productId: products.id,
          name: products.name,
          category: products.category,
          endsAt: offers.endsAt,
        })
        .from(offers)
        .innerJoin(products, eq(products.id, offers.productId))
    ).filter((s) => (!s.endsAt || s.endsAt > now) && covers(values, s));
    const excluded = new Set(prev?.excluded ?? []);
    const stacked = new Set(prev?.stacked ?? []);
    const replace: string[] = [];
    for (const s of sales) {
      const choice = decisions[s.productId];
      if (!choice) continue;
      excluded.delete(s.productId);
      stacked.delete(s.productId);
      if (choice === "skip") excluded.add(s.productId);
      else if (choice === "both") stacked.add(s.productId);
      else replace.push(s.productId);
    }
    const undecided = sales.filter(
      (s) => !excluded.has(s.productId) && !stacked.has(s.productId) && !replace.includes(s.productId),
    );
    if (undecided.length) {
      const names = undecided
        .slice(0, 3)
        .map((s) => s.name)
        .join(", ");
      throw new HttpError(
        409,
        `${undecided.length} product${undecided.length === 1 ? " has" : "s have"} their own sale price (${names}${undecided.length > 3 ? "…" : ""}). Choose Replace, Skip or Apply both for them.`,
      );
    }
    // Only keep choices for products this offer still covers.
    const inScope = new Set(sales.map((s) => s.productId));
    const row = {
      ...values,
      excluded: [...excluded].filter((x) => inScope.has(x)),
      stacked: [...stacked].filter((x) => inScope.has(x)),
    };
    if (replace.length) await tx.delete(offers).where(inArray(offers.productId, replace));
    const [o] = id
      ? await tx.update(offers).set(row).where(eq(offers.id, id)).returning()
      : await tx.insert(offers).values(row).returning();
    return { offer: o, replaced: replace.length };
  });
}

/** Edit a product's own sale price from the Offers page (same row the product editor uses). */
export async function saveSalePrice(
  offerId: string,
  data: { value: number; startsAt: Date; endsAt: Date | null; active: boolean },
) {
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .select({ productId: offers.productId, mrp: products.price, name: products.name })
      .from(offers)
      .innerJoin(products, eq(products.id, offers.productId))
      .where(eq(offers.id, offerId))
      .for("update");
    if (!row) throw new HttpError(404, "Sale price not found.");
    if (data.value < 1 || data.value >= row.mrp)
      throw new HttpError(400, `The sale price must be between ₹1 and the MRP (₹${row.mrp}).`);
    await tx.update(offers).set(data).where(eq(offers.id, offerId));
    // The shop lists the product as changed too.
    await tx.update(products).set({ updatedAt: new Date() }).where(eq(products.id, row.productId!));
    return row.name;
  });
}
export async function setOfferActive(id: string, active: boolean) {
  const [o] = await getDb().update(offers).set({ active }).where(eq(offers.id, id)).returning();
  if (!o) throw new HttpError(404, "Offer not found.");
  return o.name;
}

export async function deleteOffer(id: string) {
  await getDb().delete(offers).where(eq(offers.id, id));
}

/** Small lookup lists for pickers. */
export async function productOptions() {
  return getDb()
    .select({ id: products.id, name: products.name, category: products.category })
    .from(products)
    .orderBy(asc(products.name))
    .limit(1000);
}
