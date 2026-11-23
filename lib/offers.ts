import "server-only";
import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { getDb, schema } from "@/db";
import { applyOffer } from "@/lib/catalog";

export type Offer = typeof schema.offers.$inferSelect;

/** Cache tag cleared by the dashboard whenever offers change. */
export const OFFERS_TAG = "offers";

/** Price-relevant fields only (dates stay in the database query). */
export type ActiveOffer = Pick<
  Offer,
  "id" | "name" | "type" | "value" | "scope" | "targets" | "productId" | "excluded" | "stacked"
>;

/** Shown to customers for a product's own sale price. */
export const SALE_OFFER_NAME = "Special price";

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
        productId: offers.productId,
        excluded: offers.excluded,
        stacked: offers.stacked,
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
  ["active-offers-v2"],
  // Short lifetime so scheduled offers start/end within a minute.
  { tags: [OFFERS_TAG], revalidate: 60 },
);

/** Offers live right now (cached across requests for up to a minute). */
export const activeOffers = cache(() => loadActiveOffers());

/**
 * What a customer pays for a product right now. `p.price` is the MRP.
 *
 * - The product's own sale price (an offer with `productId`) is the starting point when it's live.
 * - Each category / store / product offer that covers it is worked out from the MRP — or from the
 *   sale price when the offer is set to "Apply both" for this product — and skipped when it is set
 *   to "Skip" for this product.
 * - The customer gets the lowest result; `offer` names what made it.
 */
export function bestPrice(
  p: { id: string; category: string; price: number },
  offers: ActiveOffer[],
): { price: number; offer: string } {
  const mrp = p.price;
  const sale = offers.find((o) => o.productId === p.id);
  const salePrice = sale ? applyOffer(sale, mrp) : mrp;
  let best = { price: salePrice, offer: sale && salePrice < mrp ? sale.name : "" };
  for (const o of offers) {
    if (o.productId) continue;
    const covers =
      o.scope === "all" ||
      (o.scope === "category" && o.targets.includes(p.category)) ||
      (o.scope === "product" && o.targets.includes(p.id));
    if (!covers || o.excluded.includes(p.id)) continue;
    const both = !!sale && o.stacked.includes(p.id);
    const price = applyOffer(o, both ? salePrice : mrp);
    if (price < best.price) best = { price, offer: both ? `${sale!.name} + ${o.name}` : o.name };
  }
  return best;
}
