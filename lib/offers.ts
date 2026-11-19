import "server-only";
import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { getDb, schema } from "@/db";

export type Offer = typeof schema.offers.$inferSelect;

/** Cache tag cleared by the dashboard whenever offers change. */
export const OFFERS_TAG = "offers";

/** Price-relevant fields only (dates stay in the database query). */
export type ActiveOffer = Pick<Offer, "id" | "name" | "type" | "value" | "scope" | "targets">;

const loadActiveOffers = unstable_cache(
  async (): Promise<ActiveOffer[]> => {
    const now = new Date();
    const { offers } = schema;
    return getDb()
      .select({
        id: offers.id,
        name: offers.name,
        type: offers.type,
        value: offers.value,
        scope: offers.scope,
        targets: offers.targets,
      })
      .from(offers)
      .where(
        and(
          eq(offers.active, true),
          lte(offers.startsAt, now),
          or(isNull(offers.endsAt), gt(offers.endsAt, now)),
        ),
      );
  },
  ["active-offers-v1"],
  // Short lifetime so scheduled offers start/end within a minute.
  { tags: [OFFERS_TAG], revalidate: 60 },
);

/** Offers live right now (cached across requests for up to a minute). */
export const activeOffers = cache(() => loadActiveOffers());

/** Price after offers: the single best active offer that applies to this product wins. */
export function bestPrice(
  p: { id: string; category: string; price: number },
  offers: ActiveOffer[],
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
