import "server-only";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { HttpError } from "@/lib/http-error";
import { hydrateProducts } from "@/lib/store-data";
import type { ProductInput } from "@/lib/validation";

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
  return { ...p, active: rows[0].active, version: rows[0].updatedAt.toISOString() };
}

/** Create/update a product; stock differences are logged as "adjust" movements. */
export async function saveProduct(input: ProductInput, actor: string) {
  const db = getDb();
  const [cat] = await db.select().from(categories).where(eq(categories.name, input.category)).limit(1);
  if (!cat) throw new HttpError(400, "Choose a valid category.");
  const id = input.id || `${slug(input.name)}-${crypto.randomUUID().slice(0, 6)}`;
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
      originalPrice: input.originalPrice,
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
  });
  return id;
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "product";

export async function setProductActive(id: string, active: boolean) {
  await getDb().update(products).set({ active, updatedAt: new Date() }).where(eq(products.id, id));
}

/** Permanent delete. Past orders keep their own copy of name/price. */
export async function deleteProduct(id: string) {
  const [p] = await getDb().delete(products).where(eq(products.id, id)).returning({ name: products.name });
  if (!p) throw new HttpError(404, "Product not found.");
  // Remove it from product-scoped offers.
  await getDb()
    .update(offers)
    .set({ targets: sql`array_remove(${offers.targets}, ${id})` })
    .where(eq(offers.scope, "product"));
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
      const [c] = await db.update(categories).set(values).where(eq(categories.id, data.id)).returning();
      if (!c) throw new HttpError(404, "Category not found.");
      return c;
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

export async function listOffers() {
  return getDb().select().from(offers).orderBy(desc(offers.active), desc(offers.startsAt));
}

export async function saveOffer(data: {
  id?: string;
  name: string;
  type: "percent" | "flat";
  value: number;
  scope: "all" | "category" | "product";
  targets: string[];
  startsAt: Date;
  endsAt: Date | null;
  active: boolean;
}) {
  const { id, ...values } = data;
  const db = getDb();
  if (id) {
    const [o] = await db.update(offers).set(values).where(eq(offers.id, id)).returning();
    if (!o) throw new HttpError(404, "Offer not found.");
    return o;
  }
  const [o] = await db.insert(offers).values(values).returning();
  return o;
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
