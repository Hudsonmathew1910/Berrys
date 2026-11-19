"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Lock,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { formatIndianMobile } from "@/lib/phone";
import { money, shippingFor, type BagLine, type Product } from "@/lib/catalog";
import { api } from "./api";
import { bagStore, bagTotals } from "./bag";
import { IconButton, Overlay } from "./modal";
import { openRazorpay, type RazorpaySuccess } from "./razorpay";
import { useToast } from "./toast";

type CheckoutResponse = {
  orderId: string;
  total: number;
  /** Local test mode: no Razorpay window, payment is simulated. */
  mock?: boolean;
  razorpay: { keyId: string; orderId: string; amount: number; currency: string };
  prefill: { name: string; email: string; contact: string };
};

type Step = "bag" | "details" | "done";

type Props = {
  bag: BagLine[];
  products: Product[];
  preview: boolean;
  /** Logged-in visitor; buying needs both a Google email and a verified mobile. */
  viewer: { email: string | null; phone: string | null } | null;
  onClose: () => void;
  onBrowse: () => void;
  onStockChanged: () => Promise<void>;
};

export function BagDrawer({ bag, products, preview, viewer, onClose, onBrowse, onStockChanged }: Props) {
  const toast = useToast();
  const [step, setStep] = useState<Step>("bag");
  const [busy, setBusy] = useState(false);
  const [doneOrder, setDoneOrder] = useState<{ id: string; status: string } | null>(null);
  const { count, subtotal } = bagTotals(bag, products);
  const shipping = shippingFor(subtotal);
  const outOfStock = bag.some((l) => {
    const p = products.find((x) => x.id === l.productId);
    return !p || (p.stock[l.size] ?? 0) < l.quantity;
  });

  function changeQty(i: number, n: number) {
    if (n < 1) return bagStore.set((b) => b.filter((_, j) => i !== j));
    const line = bag[i];
    const p = products.find((x) => x.id === line.productId);
    if (!p || n > (p.stock[line.size] ?? 0)) return toast("No more pieces available in this size.");
    bagStore.set((b) => b.map((x, j) => (i === j ? { ...x, quantity: n } : x)));
  }

  async function pay(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    let order: CheckoutResponse;
    try {
      order = await api<CheckoutResponse>("/api/checkout", {
        method: "POST",
        json: {
          items: bag,
          customer: f.get("name"),
          address: f.get("address"),
          pincode: f.get("pincode"),
        },
      });
    } catch (err) {
      toast((err as Error).message);
      await onStockChanged();
      setBusy(false);
      return;
    }

    const onSuccess = async (r: RazorpaySuccess) => {
      try {
        const result = await api<{ orderId: string; status: string }>("/api/checkout/verify", {
          method: "POST",
          json: { orderId: order.orderId, ...r },
        });
        setDoneOrder({ id: result.orderId, status: result.status });
      } catch {
        // The webhook will still confirm the payment server-side.
        setDoneOrder({ id: order.orderId, status: "processing" });
      }
      bagStore.set([]);
      setStep("done");
      setBusy(false);
      await onStockChanged();
    };

    const onDismiss = async () => {
      await api("/api/checkout/cancel", {
        method: "POST",
        json: { orderId: order.orderId, razorpayOrderId: order.razorpay.orderId },
      }).catch(() => {});
      setBusy(false);
      toast("Payment cancelled. Your bag is still here.");
      await onStockChanged();
    };

    if (order.mock) {
      const ok = window.confirm(
        `TEST MODE — no real payment.\n\nSimulate a successful payment of ${money(order.total)} for order ${order.orderId}?\n\nOK = payment succeeds · Cancel = customer closes the payment window`,
      );
      if (!ok) return onDismiss();
      try {
        const result = await api<{ orderId: string; status: string }>("/api/checkout/mock-pay", {
          method: "POST",
          json: { orderId: order.orderId, razorpayOrderId: order.razorpay.orderId },
        });
        setDoneOrder({ id: result.orderId, status: result.status });
        bagStore.set([]);
        setStep("done");
      } catch (err) {
        toast((err as Error).message);
      }
      setBusy(false);
      await onStockChanged();
      return;
    }

    try {
      await openRazorpay(
        {
          key: order.razorpay.keyId,
          amount: order.razorpay.amount,
          currency: order.razorpay.currency,
          order_id: order.razorpay.orderId,
          name: "Berry’s",
          description: `Order ${order.orderId}`,
          prefill: order.prefill,
          theme: { color: "#193547" },
          handler: onSuccess,
          modal: { ondismiss: onDismiss, confirm_close: true },
        },
        (message) => toast(message),
      );
    } catch (err) {
      toast((err as Error).message);
      await onDismiss();
    }
  }

  const close = () => {
    if (!busy) onClose();
  };

  return (
    <Overlay className="drawer-overlay" onClose={close}>
      <aside className="bag-drawer" role="dialog" aria-modal="true" aria-label="Shopping bag">
        <div className="drawer-header">
          <h2>
            {step === "done"
              ? "A little thank you."
              : step === "details"
                ? "The final little details."
                : "Your little bag."}{" "}
            {step === "bag" && <span>({count})</span>}
          </h2>
          <IconButton label="Close shopping bag" onClick={close}>
            <X size={22} />
          </IconButton>
        </div>

        {step === "done" && doneOrder ? (
          <div className="order-success">
            <CheckCircle2 size={52} />
            <h2>One happy little order.</h2>
            {doneOrder.status === "needs_refund" ? (
              <p>
                Your payment for order <b>{doneOrder.id}</b> arrived after the stock sold out. We’ll refund
                you in full — no action needed.
              </p>
            ) : (
              <p>
                Payment received. Your order number is <b>{doneOrder.id}</b>. We’ll email you the details
                shortly.
              </p>
            )}
            {viewer && (
              <small>
                You can track it any time in <Link href="/account">My orders</Link>.
              </small>
            )}
            <button className="primary" onClick={onClose}>
              Keep exploring <ArrowRight size={17} />
            </button>
          </div>
        ) : step === "details" ? (
          <form className="checkout-form" onSubmit={pay}>
            <button type="button" className="text-link" onClick={() => setStep("bag")} disabled={busy}>
              <ArrowLeft size={15} />
              Back to bag
            </button>
            <label>
              Your name
              <input name="name" required minLength={2} maxLength={100} autoComplete="name" />
            </label>
            <div className="verified-contact">
              <div>
                <span>Email</span> {viewer?.email}
              </div>
              <div>
                <span>Mobile</span> {viewer?.phone && formatIndianMobile(viewer.phone)}
              </div>
              <small>Order updates go to your verified email and mobile.</small>
            </div>
            <label>
              Delivery address
              <textarea
                name="address"
                required
                minLength={10}
                maxLength={1000}
                autoComplete="street-address"
                placeholder="House, street, area, city and state"
              />
            </label>
            <label>
              PIN code
              <input
                name="pincode"
                required
                inputMode="numeric"
                autoComplete="postal-code"
                pattern="[1-9][0-9]{5}"
                maxLength={6}
              />
            </label>
            <div className="subtotal">
              <span>Subtotal</span>
              <b>{money(subtotal)}</b>
            </div>
            <div className="subtotal">
              <span>Shipping</span>
              <b>{shipping ? money(shipping) : "Free"}</b>
            </div>
            <div className="subtotal">
              <span>Order total</span>
              <b>{money(subtotal + shipping)}</b>
            </div>
            <button className="primary" disabled={busy}>
              {busy ? <Loader2 className="spin" size={17} /> : <Lock size={17} />}
              Pay {money(subtotal + shipping)}
            </button>
            <small>Secure payment by Razorpay · UPI, cards, netbanking and wallets.</small>
          </form>
        ) : !bag.length ? (
          <div className="empty-bag">
            <ShoppingBag size={48} />
            <h2>A little room for favourites.</h2>
            <p>Your bag is waiting for its first adventure.</p>
            <button className="primary" onClick={onBrowse}>
              Discover the collection <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <>
            <div className="bag-items">
              {bag.map((line, i) => {
                const p = products.find((x) => x.id === line.productId);
                if (!p) {
                  return (
                    <div key={line.productId + line.size} className="bag-line">
                      <p>This product is no longer available.</p>
                      <button onClick={() => changeQty(i, 0)}>Remove</button>
                    </div>
                  );
                }
                return (
                  <div className="bag-line" key={p.id + line.size}>
                    <img src={p.image} alt={p.name} />
                    <div>
                      <small>{p.category}</small>
                      <h3>{p.name}</h3>
                      <p>
                        Size {line.size} <span>·</span> {money(p.price)}
                      </p>
                      {(p.stock[line.size] ?? 0) < line.quantity && (
                        <small className="form-error">
                          Only {p.stock[line.size] ?? 0} available. Please update your bag.
                        </small>
                      )}
                      <div className="bag-line-bottom">
                        <div className="quantity">
                          <button
                            aria-label="Decrease bag quantity"
                            onClick={() => changeQty(i, line.quantity - 1)}
                          >
                            <Minus size={13} />
                          </button>
                          <span>{line.quantity}</span>
                          <button
                            aria-label="Increase bag quantity"
                            onClick={() => changeQty(i, line.quantity + 1)}
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                        <IconButton label={"Remove " + p.name} onClick={() => changeQty(i, 0)}>
                          <Trash2 size={15} />
                        </IconButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="bag-summary">
              <div className="subtotal">
                <span>Subtotal</span>
                <b>{money(subtotal)}</b>
              </div>
              <p>
                {preview
                  ? "The store isn’t open for orders yet."
                  : shipping
                    ? `Shipping ${money(shipping)} added at checkout.`
                    : "Free shipping on this order."}
              </p>
              {preview ? (
                <button className="primary" disabled>
                  Continue to checkout <ArrowRight size={17} />
                </button>
              ) : !viewer ? (
                <Link className="primary" href={`/login?next=${encodeURIComponent("/?bag=1")}`}>
                  Login to checkout <ArrowRight size={17} />
                </Link>
              ) : !viewer.email || !viewer.phone ? (
                <>
                  <small>
                    To buy, please link your {viewer.email ? "mobile number" : "Google account"} too.
                  </small>
                  <Link className="primary" href={`/login?link=1&next=${encodeURIComponent("/?bag=1")}`}>
                    {viewer.email ? "Verify mobile number" : "Link Google account"} <ArrowRight size={17} />
                  </Link>
                </>
              ) : (
                <button className="primary" disabled={outOfStock} onClick={() => setStep("details")}>
                  Continue to checkout <ArrowRight size={17} />
                </button>
              )}
              <button className="text-link" onClick={onClose}>
                A little more browsing
              </button>
            </div>
          </>
        )}
      </aside>
    </Overlay>
  );
}
