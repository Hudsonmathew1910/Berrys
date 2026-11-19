import "server-only";
import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import { cache } from "react";
import { getDb, schema } from "@/db";

export type Offer = typeof schema.offers.$inferSelect;

/** Offers live right now (cached for one request). */
export const activeOffers = cache(async (): Promise<Offer[]> => {
  const now = new Date();
  const { offers } = schema;
  return getDb()
    .select()
    .from(offers)
    .where(
      and(
        eq(offers.active, true),
        lte(offers.startsAt, now),
        or(isNull(offers.endsAt), gt(offers.endsAt, now)),
      ),
    );
});

/** Price after offers: the single best active offer that applies to this product wins. */
export function bestPrice(
  p: { id: string; category: string; price: number },
  offers: Offer[],
): { price: number; offer: string } {
  let best = { price: p.price, offer: "" };
  for (const o of offers) {
    const applies =
      o.scope === "all" ||
      (o.scope === "category" && o.targets.includes(p.category)) ||
      (o.scope === "product" && o.targets.includes(p.id));
    if (!applies) continue;
    const off = o.type === "percent" ? Math.round((p.price * Math.min(o.value, 90)) / 100) : o.value;
    const price = Math.max(1, p.price - off);
    if (price < best.price) best = { price, offer: o.name };
  }
  return best;
}
