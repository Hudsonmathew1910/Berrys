"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { money } from "@/lib/catalog";
import { api } from "@/components/store/api";
import { useToast } from "@/components/store/toast";

type Item = { id: string; name: string; size: string; quantity: number; price: number };

/** "Request a refund" on the customer's order page: whole order or chosen pieces, with a reason. */
export function RefundRequestForm({
  orderId,
  items,
  shipping,
  reasons,
}: {
  orderId: string;
  items: Item[];
  shipping: number;
  reasons: readonly string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [whole, setWhole] = useState(true);
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((i) => [i.id, 0])),
  );
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const chosen = whole
    ? items.map((i) => ({ ...i, n: i.quantity }))
    : items.map((i) => ({ ...i, n: qty[i.id] ?? 0 }));
  const allChosen = chosen.every((i) => i.n === i.quantity);
  const amount = chosen.reduce((a, i) => a + i.price * i.n, 0) + (allChosen ? shipping : 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!whole && !chosen.some((i) => i.n > 0)) return setError("Choose at least one piece to refund.");
    if (!reason) return setError("Please choose a reason.");
    setBusy(true);
    try {
      await api("/api/account/refunds", {
        method: "POST",
        json: {
          orderId,
          wholeOrder: whole,
          items: chosen.filter((i) => i.n > 0).map((i) => ({ orderItemId: i.id, quantity: i.n })),
          reason,
          details,
        },
      });
      toast("Refund request sent. We’ll email you when it’s reviewed.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button type="button" className="outline refund-open" onClick={() => setOpen(true)}>
        <RotateCcw size={16} /> Request a refund
      </button>
    );

  return (
    <form className="refund-form" onSubmit={submit}>
      <fieldset className="refund-choice">
        <legend>What would you like refunded?</legend>
        <label className="check">
          <input type="radio" name="scope" checked={whole} onChange={() => setWhole(true)} /> The whole order
        </label>
        <label className="check">
          <input type="radio" name="scope" checked={!whole} onChange={() => setWhole(false)} /> Only some
          pieces
        </label>
      </fieldset>

      {!whole && (
        <ul className="refund-items">
          {items.map((i) => (
            <li key={i.id}>
              <span>
                <b>{i.name}</b>
                <small>
                  Size {i.size} · {money(i.price)} each
                </small>
              </span>
              <select
                aria-label={`How many ${i.name} to refund`}
                value={qty[i.id] ?? 0}
                onChange={(e) => setQty((q) => ({ ...q, [i.id]: Number(e.target.value) }))}
              >
                {Array.from({ length: i.quantity + 1 }, (_, n) => (
                  <option key={n} value={n}>
                    {n === 0 ? "None" : `${n} of ${i.quantity}`}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}

      <label>
        Reason
        <select value={reason} onChange={(e) => setReason(e.target.value)} required>
          <option value="">Choose a reason…</option>
          {reasons.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label>
        Tell us more {reason !== "Other" && <small className="muted">(optional)</small>}
        <textarea
          rows={3}
          maxLength={1000}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="What went wrong? For a damaged item, describe the damage."
        />
      </label>
      <p className="refund-amount">
        Refund amount: <b>{money(amount)}</b>
        {allChosen && shipping > 0 && <small> (includes {money(shipping)} shipping)</small>}
      </p>
      {error && <p className="form-error">{error}</p>}
      <div className="refund-actions">
        <button className="primary" disabled={busy}>
          {busy ? <Loader2 className="spin" size={16} /> : <RotateCcw size={16} />} Send refund request
        </button>
        <button type="button" className="text-link" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
