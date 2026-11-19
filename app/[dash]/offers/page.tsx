import { listOffers, productOptions } from "@/lib/admin/catalog";
import { getCategories } from "@/lib/categories";
import { requirePage } from "@/lib/staff";
import { ActionForm } from "@/components/dashboard/action-form";
import { deleteOfferAction, saveOfferAction } from "../actions";

type Offer = Awaited<ReturnType<typeof listOffers>>[number];
type Opts = { categories: string[]; products: { id: string; name: string; category: string }[] };

/** yyyy-MM-ddTHH:mm in India time, for datetime-local inputs. */
const local = (d: Date | null | undefined) =>
  d ? new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 16) : "";

function OfferFields({ o, opts }: { o?: Offer; opts: Opts }) {
  return (
    <div className="form-grid">
      {o && <input type="hidden" name="id" value={o.id} />}
      <label className="wide">
        Name (shown to customers)
        <input
          name="name"
          required
          maxLength={80}
          defaultValue={o?.name}
          placeholder="Diwali sale — 20% off"
        />
      </label>
      <label>
        Discount type
        <select name="type" defaultValue={o?.type ?? "percent"}>
          <option value="percent">% off</option>
          <option value="flat">₹ off</option>
        </select>
      </label>
      <label>
        Amount
        <input name="value" type="number" min={1} required defaultValue={o?.value ?? 10} />
      </label>
      <label>
        Applies to
        <select name="scope" defaultValue={o?.scope ?? "category"}>
          <option value="all">Whole store</option>
          <option value="category">Chosen categories</option>
          <option value="product">Chosen products</option>
        </select>
      </label>
      <label>
        Categories / products (hold Ctrl to pick several)
        <select name="targets" multiple size={6} defaultValue={o?.targets}>
          <optgroup label="Categories">
            {opts.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </optgroup>
          <optgroup label="Products">
            {opts.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.category})
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <label>
        Starts (India time)
        <input name="startsAt" type="datetime-local" defaultValue={local(o?.startsAt)} />
      </label>
      <label>
        Ends (optional)
        <input name="endsAt" type="datetime-local" defaultValue={local(o?.endsAt)} />
      </label>
      <label className="check wide">
        <input type="checkbox" name="active" defaultChecked={o?.active ?? true} /> Active
      </label>
    </div>
  );
}

export default async function OffersPage() {
  await requirePage("offers");
  const [offers, cats, products] = await Promise.all([listOffers(), getCategories(false), productOptions()]);
  const opts = { categories: cats.map((c) => c.name), products };
  const now = new Date();
  const state = (o: Offer) =>
    !o.active ? "Off" : o.startsAt > now ? "Scheduled" : o.endsAt && o.endsAt <= now ? "Ended" : "Live";

  return (
    <div className="dash-page">
      <div className="dash-heading">
        <div>
          <h1>Offers</h1>
          <span className="muted">
            Automatic discounts. If several apply to a product, the customer gets the best one. Times are
            India time.
          </span>
        </div>
      </div>
      <div className="dash-grid">
        <section className="dash-panel highlight">
          <h2>Create an offer</h2>
          <ActionForm action={saveOfferAction} resetOnSuccess>
            <OfferFields opts={opts} />
            <button className="primary">Create offer</button>
          </ActionForm>
        </section>
        {offers.map((o) => (
          <section key={o.id} className="dash-panel">
            <h2>
              {o.name} <span className={"status-pill " + (state(o) === "Live" ? "" : "out")}>{state(o)}</span>
            </h2>
            <ActionForm action={saveOfferAction}>
              <OfferFields o={o} opts={opts} />
              <button className="outline">Save</button>
            </ActionForm>
            <ActionForm action={deleteOfferAction} confirm={`Delete the offer “${o.name}”?`}>
              <input type="hidden" name="id" value={o.id} />
              <input type="hidden" name="name" value={o.name} />
              <button className="text-link danger">Delete offer</button>
            </ActionForm>
          </section>
        ))}
      </div>
    </div>
  );
}
