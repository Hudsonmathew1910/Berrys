"use client";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { applyOffer, money } from "@/lib/catalog";
import { FORM_DONE } from "./action-form";
import type { ActionResult } from "@/app/[dash]/actions";

type Action = (prev: ActionResult, data: FormData) => Promise<ActionResult>;
type Choice = "replace" | "skip" | "both";

export type OfferValues = {
  id: string;
  name: string;
  type: "percent" | "flat";
  value: number;
  scope: "all" | "category" | "product";
  targets: string[];
  /** India time, yyyy-MM-ddTHH:mm ("" = now / no end). */
  startsAt: string;
  endsAt: string;
  active: boolean;
  excluded: string[];
  stacked: string[];
};
/** A product's own sale price (not ended). */
export type SaleInfo = { productId: string; name: string; category: string; mrp: number; sale: number };

const choiceLabel: Record<Choice, string> = {
  replace: "Replace its sale price",
  skip: "Skip (keep its sale price)",
  both: "Apply both",
};

/**
 * Create or edit one category / store / product offer. When it covers products that have their own
 * sale price, it asks — for all of them or one by one — Replace, Skip or Apply both, with the price
 * the customer would pay in each case.
 */
export function OfferForm({
  action,
  offer,
  categories,
  products,
  sales,
  title,
  onSaved,
  onRemove,
}: {
  action: Action;
  offer?: OfferValues;
  categories: string[];
  products: { id: string; name: string; category: string }[];
  sales: SaleInfo[];
  title?: string;
  /** New offers: called once saved (the card is removed). */
  onSaved?: () => void;
  onRemove?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [scope, setScope] = useState(offer?.scope ?? "category");
  const [targets, setTargets] = useState<string[]>(offer?.targets ?? []);
  const [type, setType] = useState(offer?.type ?? "percent");
  const [value, setValue] = useState(String(offer?.value ?? 10));
  const [choices, setChoices] = useState<Record<string, Choice>>(() => ({
    ...Object.fromEntries((offer?.excluded ?? []).map((id) => [id, "skip" as const])),
    ...Object.fromEntries((offer?.stacked ?? []).map((id) => [id, "both" as const])),
  }));
  const [localError, setLocalError] = useState("");
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.at) return;
    ref.current?.dispatchEvent(new CustomEvent(FORM_DONE, { detail: state, bubbles: true }));
    if (state.ok && !state.error) onSaved?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const conflicts = sales.filter(
    (s) =>
      scope === "all" ||
      (scope === "category" && targets.includes(s.category)) ||
      (scope === "product" && targets.includes(s.productId)),
  );
  const undecided = conflicts.filter((s) => !choices[s.productId]);
  const amount = Math.max(0, Number(value) || 0);
  const self = { type, value: amount };
  const outcome = (s: SaleInfo, c: Choice) =>
    c === "replace" ? applyOffer(self, s.mrp) : c === "skip" ? s.sale : applyOffer(self, s.sale);
  const options: [string, string][] =
    scope === "category"
      ? categories.map((c) => [c, c])
      : scope === "product"
        ? products.map((p) => [p.id, `${p.name} (${p.category})`])
        : [];
  const setAll = (c: Choice) =>
    setChoices((x) => ({ ...x, ...Object.fromEntries(conflicts.map((s) => [s.productId, c])) }));

  const msg = localError || state.error || state.ok;
  return (
    <form
      ref={ref}
      className="dash-form offer-form"
      data-save-all=""
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        if (undecided.length) {
          const text = `Choose Replace, Skip or Apply both for ${undecided.length} product${undecided.length === 1 ? "" : "s"} with their own sale price.`;
          setLocalError(text);
          ref.current?.dispatchEvent(
            new CustomEvent(FORM_DONE, { detail: { error: text, at: Date.now() }, bubbles: true }),
          );
          return;
        }
        setLocalError("");
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <fieldset disabled={pending}>
        {(title || onRemove) && (
          <div className="offer-form-head">
            {title && <b>{title}</b>}
            {onRemove && (
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${title ?? "offer"}`}
                onClick={onRemove}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
        {offer?.id && <input type="hidden" name="id" value={offer.id} />}
        {targets.map((t) => (
          <input key={t} type="hidden" name="targets" value={t} />
        ))}
        <input
          type="hidden"
          name="decisions"
          value={JSON.stringify(
            Object.fromEntries(
              conflicts.filter((s) => choices[s.productId]).map((s) => [s.productId, choices[s.productId]]),
            ),
          )}
        />
        <div className="form-grid offer-grid">
          <label className="wide">
            Name (shown to customers)
            <input name="name" required maxLength={80} defaultValue={offer?.name} placeholder="Diwali sale" />
          </label>
          <label>
            Discount
            <select name="type" value={type} onChange={(e) => setType(e.target.value as "percent" | "flat")}>
              <option value="percent">% off</option>
              <option value="flat">₹ off</option>
            </select>
          </label>
          <label>
            Amount
            <input
              name="value"
              type="number"
              min={1}
              max={type === "percent" ? 90 : 100000}
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <label>
            Applies to
            <select
              name="scope"
              value={scope}
              onChange={(e) => {
                setScope(e.target.value as OfferValues["scope"]);
                setTargets([]);
              }}
            >
              <option value="all">Whole store</option>
              <option value="category">Categories</option>
              <option value="product">Products</option>
            </select>
          </label>
          {scope !== "all" && (
            <div className="wide offer-targets">
              <span className="offer-label">Which {scope === "category" ? "categories" : "products"}</span>
              <div className="offer-target-list">
                {options.map(([v, text]) => (
                  <label key={v} className="check">
                    <input
                      type="checkbox"
                      checked={targets.includes(v)}
                      onChange={(e) =>
                        setTargets((x) => (e.target.checked ? [...x, v] : x.filter((y) => y !== v)))
                      }
                    />{" "}
                    {text}
                  </label>
                ))}
              </div>
            </div>
          )}
          <label>
            Starts (India time)
            <input name="startsAt" type="datetime-local" defaultValue={offer?.startsAt} />
            <small className="muted">Empty = now</small>
          </label>
          <label>
            Ends
            <input name="endsAt" type="datetime-local" defaultValue={offer?.endsAt} />
            <small className="muted">Empty = no end</small>
          </label>
          <label className="check wide">
            <input type="checkbox" name="active" defaultChecked={offer?.active ?? true} /> Offer is on
          </label>
        </div>

        {conflicts.length > 0 && (
          <div className={"offer-conflicts" + (undecided.length ? " needs" : "")}>
            <p>
              <b>
                {conflicts.length} product{conflicts.length === 1 ? " has" : "s have"} their own sale price.
              </b>{" "}
              What should this offer do for {conflicts.length === 1 ? "it" : "them"}?
            </p>
            <div className="button-row">
              {(Object.keys(choiceLabel) as Choice[]).map((c) => (
                <button key={c} type="button" className="outline" onClick={() => setAll(c)}>
                  {c === "replace" ? "Replace all" : c === "skip" ? "Skip all" : "Apply both to all"}
                </button>
              ))}
            </div>
            <div className="table-scroll">
              <table className="dash-table compact">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>MRP</th>
                    <th>Sale price</th>
                    <th>Choice (customer pays)</th>
                  </tr>
                </thead>
                <tbody>
                  {conflicts.map((s) => (
                    <tr key={s.productId} className={choices[s.productId] ? undefined : "row-error"}>
                      <td>
                        {s.name}
                        <small className="block muted">{s.category}</small>
                      </td>
                      <td>{money(s.mrp)}</td>
                      <td>{money(s.sale)}</td>
                      <td>
                        <select
                          aria-label={`Choice for ${s.name}`}
                          value={choices[s.productId] ?? ""}
                          onChange={(e) =>
                            setChoices((x) => ({ ...x, [s.productId]: e.target.value as Choice }))
                          }
                        >
                          <option value="" disabled>
                            Choose…
                          </option>
                          {(Object.keys(choiceLabel) as Choice[]).map((c) => (
                            <option key={c} value={c}>
                              {choiceLabel[c]} → {money(outcome(s, c))}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <small className="muted">
              Replace removes the product’s own sale price. Skip leaves it on its sale price. Apply both takes
              this offer off the sale price.
            </small>
          </div>
        )}

        <div className="button-row">
          <button className={offer?.id ? "outline" : "primary"}>
            {pending && <Loader2 className="spin" size={15} />} {offer?.id ? "Save" : "Create offer"}
          </button>
        </div>
      </fieldset>
      {msg && (
        <p
          key={state.at}
          className={localError || state.error ? "form-msg error" : "form-msg ok"}
          role="status"
        >
          {localError || state.error ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />} {msg}
        </p>
      )}
    </form>
  );
}

/** Several new offers at once: one card each, saved together. */
export function NewOffers(
  props: Omit<Parameters<typeof OfferForm>[0], "offer" | "onSaved" | "onRemove" | "title">,
) {
  const next = useRef(1);
  const [ids, setIds] = useState([0]);
  const box = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  async function saveAll() {
    setBusy(true);
    for (const form of [...(box.current?.querySelectorAll<HTMLFormElement>("form.offer-form") ?? [])]) {
      if (!form.isConnected || !form.checkValidity()) {
        form.reportValidity();
        continue;
      }
      await new Promise<void>((resolve) => {
        const t = setTimeout(done, 60_000);
        function done() {
          clearTimeout(t);
          form.removeEventListener(FORM_DONE, done);
          resolve();
        }
        form.addEventListener(FORM_DONE, done);
        form.requestSubmit();
      });
    }
    setBusy(false);
  }

  return (
    <div className="new-offers" ref={box}>
      {ids.map((id, i) => (
        <div key={id} className="rows-card">
          <OfferForm
            {...props}
            title={`Offer ${i + 1}`}
            onSaved={() => setIds((x) => (x.length > 1 ? x.filter((y) => y !== id) : [next.current++]))}
            onRemove={ids.length > 1 ? () => setIds((x) => x.filter((y) => y !== id)) : undefined}
          />
        </div>
      ))}
      <div className="rows-actions">
        <button type="button" className="outline" onClick={() => setIds((x) => [...x, next.current++])}>
          + Add another offer
        </button>
        {ids.length > 1 && (
          <button type="button" className="primary" onClick={saveAll} disabled={busy}>
            {busy && <Loader2 className="spin" size={15} />} Create all {ids.length} offers
          </button>
        )}
      </div>
    </div>
  );
}
