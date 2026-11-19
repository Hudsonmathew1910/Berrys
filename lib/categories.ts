import "server-only";
import { asc, eq } from "drizzle-orm";
import { cache } from "react";
import { getDb, schema } from "@/db";
import type { Category } from "@/lib/catalog";

const { categories } = schema;

/** All categories in display order (cached for one request). */
export const getCategories = cache(async (activeOnly = true): Promise<Category[]> => {
  const rows = await getDb()
    .select()
    .from(categories)
    .where(activeOnly ? eq(categories.active, true) : undefined)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    image: c.image,
    sizes: c.sizes,
    sortOrder: c.sortOrder,
    active: c.active,
  }));
});
