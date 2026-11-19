import "server-only";
import { asc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { getDb, schema } from "@/db";
import type { Category } from "@/lib/catalog";

const { categories } = schema;

/** Cache tag cleared by the dashboard whenever categories change. */
export const CATEGORIES_TAG = "categories";

const loadCategories = unstable_cache(
  async (activeOnly: boolean): Promise<Category[]> => {
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
  },
  ["categories-v1"],
  // Shared across requests and server instances; refreshed on change or every 10 min.
  { tags: [CATEGORIES_TAG], revalidate: 600 },
);

/** All categories in display order (cached across requests, de-duplicated within one). */
export const getCategories = cache((activeOnly: boolean = true) => loadCategories(activeOnly));
