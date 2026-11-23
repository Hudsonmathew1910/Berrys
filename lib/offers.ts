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
  | "id"
  | "name"
  | "type"
  | "value"
  | "scope"
  | "targets"
  | "productId"
  | "excluded"
  | "stacked"
  | "replaced"
  | "endsAt"
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
        replaced: offers.replaced,
        endsAt: offers.endsAt,
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
  ["active-offers-v3"],
  // Short lifetime so scheduled offers start/end within a minute.
  { tags: [OFFERS_TAG], revalidate: 60 },
);

/** Offers live right now (cached across requests for up to a minute). */
export const activeOffers = cache(() => loadActiveOffers());

/**
 * What a customer pays for a product right now. `p.price` is the MRP.
 *
 * - The product's own sale price (an offer with `productId`) is the starting point when it's live —
 *   unless a live offer is set to "Replace" it, which sets it aside only while that offer runs.
 * - Each category / store / product offer that covers it is worked out from the MRP — or from the
 *   sale price when set to "Apply both" — and leaves it alone when set to "Skip".
 * - The customer gets the lowest result; `offer` names what made it and `endsAt` is when that price
 *   stops (the earliest end of the offers used; null = no end).
 */
export function bestPrice(
  p: { id: string; category: string; price: number },
  offers: ActiveOffer[],
): { price: number; offer: string; endsAt: Date | null } {
  const mrp = p.price;
  const covers = (o: ActiveOffer) =>
    o.scope === "all" ||
    (o.scope === "category" && o.targets.includes(p.category)) ||
    (o.scope === "product" && o.targets.includes(p.id));
  const promos = offers.filter((o) => !o.productId && covers(o));
  const ownSale = offers.find((o) => o.productId === p.id);
  const sale = ownSale && !promos.some((o) => o.replaced.includes(p.id)) ? ownSale : undefined;
  const salePrice = sale ? applyOffer(sale, mrp) : mrp;
  const earliest = (...ds: (Date | null | undefined)[]) =>
    ds.reduce<Date | null>((a, d) => (d && (!a || new Date(d) < a) ? new Date(d) : a), null);
  let best =
    sale && salePrice < mrp
      ? { price: salePrice, offer: sale.name, endsAt: earliest(sale.endsAt) }
      : { price: mrp, offer: "", endsAt: null as Date | null };
  for (const o of promos) {
    if (o.excluded.includes(p.id) && sale) continue;
    const both = !!sale && o.stacked.includes(p.id);
    const price = applyOffer(o, both ? salePrice : mrp);
    if (price < best.price)
      best = both
        ? { price, offer: `${sale!.name} + ${o.name}`, endsAt: earliest(sale!.endsAt, o.endsAt) }
        : { price, offer: o.name, endsAt: earliest(o.endsAt) };
  }
  return best;
}
