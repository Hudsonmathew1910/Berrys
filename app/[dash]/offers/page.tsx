import Link from "next/link";
import { listOffers, listSalePrices, productOptions } from "@/lib/admin/catalog";
import { getCategories } from "@/lib/categories";
import { discountPercent, money, toIndiaInput } from "@/lib/catalog";
import { adminHref, requirePage } from "@/lib/staff";
import { ActionForm } from "@/components/dashboard/action-form";
import { BulkBar, BulkCheck } from "@/components/dashboard/bulk-bar";
import { NewOffers, OfferForm } from "@/components/dashboard/offer-form";
import { bulkOffersAction, deleteOfferAction, saveOfferAction, saveSalePriceAction } from "../actions";

type When = { active: boolean; startsAt: Date; endsAt: Date | null };
const stateOf = (o: When, now: Date) =>
  !o.active ? "Off" : o.startsAt > now ? "Scheduled" : o.endsAt && o.endsAt <= now ? "Ended" : "Live";

export default async function OffersPage() {
  await requirePage("offers");
  const [offers, sales, cats, products] = await Promise.all([
    listOffers(),
    listSalePrices(),
    getCategories(false),
    productOptions(),
  ]);
  const now = new Date();
  const categories = cats.map((c) => c.name);
  // Sale prices that can still matter (not ended) — offers are asked what to do with these.
  const openSales = sales
    .filter((s) => !s.endsAt || s.endsAt > now)
    .map((s) => ({ productId: s.productId, name: s.name, category: s.category, mrp: s.mrp, sale: s.sale }));
  const shared = { action: saveOfferAction, categories, products, sales: openSales };

  return (
    <div className="dash-page">
      <div className="dash-heading">
        <div>
          <h1>Offers</h1>
          <span className="muted">
            A product’s <b>MRP</b> is its normal price. Discounts come from two places, both listed here: a
            product’s own <b>sale price</b> (set on the product), and <b>offers</b> for categories, products
            or the whole store. If several apply, the customer gets the lowest price. Times are India time.
          </span>
        </div>
      </div>

      <section className="dash-panel highlight">
        <h2>Create offers</h2>
        <NewOffers {...shared} />
      </section>

      <section className="dash-panel">
        <h2>
          Offers <small className="muted">· {offers.length}</small>
        </h2>
        <BulkBar
          id="offers-bulk"
          action={bulkOffersAction}
          noun="offer"
          ops={[
            { op: "on", label: "Turn on" },
            { op: "off", label: "Turn off" },
            { op: "delete", label: "Delete", danger: true, confirm: "Delete {n} offers?" },
          ]}
        />
        <div className="dash-grid">
          {offers.map((o) => {
            const st = stateOf(o, now);
            return (
              <section key={o.id} className="dash-panel offer-card">
                <h3>
                  <BulkCheck form="offers-bulk" value={o.id} label={`Select ${o.name}`} /> {o.name}{" "}
                  <span className={"status-pill " + (st === "Live" ? "" : "out")}>{st}</span>
                </h3>
                <OfferForm
                  key={`${o.id}:${o.excluded.join()}:${o.stacked.join()}:${o.targets.join()}`}
                  {...shared}
                  offer={{
                    id: o.id,
                    name: o.name,
                    type: o.type === "flat" ? "flat" : "percent",
                    value: o.value,
                    scope: o.scope,
                    targets: o.targets,
                    startsAt: toIndiaInput(o.startsAt),
                    endsAt: toIndiaInput(o.endsAt),
                    active: o.active,
                    excluded: o.excluded,
                    stacked: o.stacked,
                  }}
                />
                <ActionForm action={deleteOfferAction} confirm={`Delete the offer “${o.name}”?`}>
                  <input type="hidden" name="id" value={o.id} />
                  <input type="hidden" name="name" value={o.name} />
                  <button className="text-link danger">Delete offer</button>
                </ActionForm>
              </section>
            );
          })}
          {!offers.length && <p className="dash-empty">No offers yet.</p>}
        </div>
      </section>

      <section className="dash-panel" id="sale-prices">
        <h2>
          Sale prices <small className="muted">· products’ own price below MRP</small>
        </h2>
        <p className="muted">
          Set on each product (MRP + sale price). Changing it here changes the product too — it’s the same
          record. Remove it to sell at the MRP again.
        </p>
        <BulkBar
          id="sales-bulk"
          action={bulkOffersAction}
          noun="sale price"
          ops={[
            { op: "on", label: "Turn on" },
            { op: "off", label: "Turn off" },
            {
              op: "delete",
              label: "Remove",
              danger: true,
              confirm: "Remove {n} sale prices? Those products go back to their MRP.",
            },
          ]}
        />
        <div className="sale-list">
          {sales.map((s) => {
            const st = stateOf(s, now);
            return (
              <div key={s.offerId} className="sale-row">
                <div className="sale-product">
                  <BulkCheck form="sales-bulk" value={s.offerId} label={`Select sale price of ${s.name}`} />
                  <img src={s.image} alt="" />
                  <span>
                    <Link href={adminHref(`products/${encodeURIComponent(s.productId)}`)}>
                      <b>{s.name}</b>
                    </Link>
                    <small className="block muted">
                      {s.category} · MRP {money(s.mrp)} → {money(s.sale)} (
                      {discountPercent({ price: s.sale, originalPrice: s.mrp })}% off)
                    </small>
                  </span>
                  <span className={"status-pill " + (st === "Live" ? "" : "out")}>{st}</span>
                </div>
                <ActionForm action={saveSalePriceAction} saveAll inline className="sale-form">
                  <input type="hidden" name="id" value={s.offerId} />
                  <label>
                    Sale price ₹
                    <input
                      name="value"
                      type="number"
                      min={1}
                      max={s.mrp - 1}
                      required
                      defaultValue={s.sale}
                      aria-label={`Sale price of ${s.name}`}
                    />
                  </label>
                  <label>
                    Starts
                    <input name="startsAt" type="datetime-local" defaultValue={toIndiaInput(s.startsAt)} />
                  </label>
                  <label>
                    Ends
                    <input name="endsAt" type="datetime-local" defaultValue={toIndiaInput(s.endsAt)} />
                  </label>
                  <label className="check">
                    <input type="checkbox" name="active" defaultChecked={s.active} /> On
                  </label>
                  <button className="outline">Save</button>
                </ActionForm>
              </div>
            );
          })}
          {!sales.length && <p className="dash-empty">No product has a sale price.</p>}
        </div>
      </section>
    </div>
  );
}
