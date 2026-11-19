"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Lock, MapPin, Plus } from "lucide-react";
import { money, shippingFor } from "@/lib/catalog";
import { formatIndianMobile } from "@/lib/phone";
import { api } from "@/components/store/api";
import { bagStore, bagTotals, useBag } from "@/components/store/bag";
import { openRazorpay, type RazorpaySuccess } from "@/components/store/razorpay";
import { useToast } from "@/components/store/toast";
import { AddressFields, readAddress } from "./address-form";
import { useProducts } from "./use-products";

export type SavedAddress = {
  id: string;
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
};

type CheckoutResponse = {
  orderId: string;
  total: number;
  mock?: boolean;
  razorpay: { keyId: string; orderId: string; amount: number; currency: string };
  prefill: { name: string; email: string; contact: string };
};

/** Checkout page: delivery address, order review and payment. */
export function CheckoutView({ email, addresses }: { email: string; addresses: SavedAddress[] }) {
  const router = useRouter();
  const toast = useToast();
  const bag = useBag();
  const { products, loading } = useProducts(bag.map((l) => l.productId));
  const [selected, setSelected] = useState(
    addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "new",
  );
  const [busy, setBusy] = useState(false);
  const { count, subtotal } = bagTotals(bag, products);
  const shipping = shippingFor(subtotal);
  const problems = bag.some((l) => {
    const p = products.find((x) => x.id === l.productId);
    return !p || (p.stock[l.size] ?? 0) < l.quantity;
  });

  if (!bag.length && !busy) {
    return (
      <div className="empty-state page-empty">
        <h2>Your bag is empty.</h2>
        <Link className="primary" href="/shop">
          Discover the collection
        </Link>
      </div>
    );
  }

  const finish = (orderId: string) => {
    bagStore.set([]);
    router.push(`/checkout/success?order=${encodeURIComponent(orderId)}`);
  };

  async function pay(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    let order: CheckoutResponse;
    try {
      order = await api<CheckoutResponse>("/api/checkout", {
        method: "POST",
        json:
          selected === "new"
            ? {
                items: bag,
                address: readAddress(e.currentTarget),
                saveAddress: new FormData(e.currentTarget).get("save") === "on",
              }
            : { items: bag, addressId: selected },
      });
    } catch (err) {
      toast((err as Error).message);
      setBusy(false);
      return;
    }

    const cancel = async () => {
      await api("/api/checkout/cancel", {
        method: "POST",
        json: { orderId: order.orderId, razorpayOrderId: order.razorpay.orderId },
      }).catch(() => {});
      setBusy(false);
      toast("Payment cancelled. Your bag is still here.");
    };

    if (order.mock) {
      const ok = window.confirm(
        `TEST MODE — no real payment.\n\nSimulate a successful payment of ${money(order.total)} for order ${order.orderId}?`,
      );
      if (!ok) return cancel();
      try {
        await api("/api/checkout/mock-pay", {
          method: "POST",
          json: { orderId: order.orderId, razorpayOrderId: order.razorpay.orderId },
        });
        finish(order.orderId);
      } catch (err) {
        toast((err as Error).message);
        setBusy(false);
      }
      return;
    }

    const onSuccess = async (r: RazorpaySuccess) => {
      // Even if this call fails, the Razorpay webhook confirms the payment.
      await api("/api/checkout/verify", { method: "POST", json: { orderId: order.orderId, ...r } }).catch(
        () => {},
      );
      finish(order.orderId);
    };
    try {
      await openRazorpay(
        {
          key: order.razorpay.keyId,
          amount: order.razorpay.amount,
          currency: order.razorpay.currency,
          order_id: order.razorpay.orderId,
          name: "Berry’s",
          description: `Order ${order.orderId}`,
          image: "/images/berrys-mark.webp",
          prefill: order.prefill,
          theme: { color: "#183147" },
          handler: onSuccess,
          modal: { ondismiss: cancel, confirm_close: true },
        },
        (message) => toast(message),
      );
    } catch (err) {
      toast((err as Error).message);
      await cancel();
    }
  }

  return (
    <form className="cart-layout checkout-layout" onSubmit={pay}>
      <div className="checkout-main">
        <section className="checkout-step">
          <h2>
            <MapPin size={18} /> Delivery address
          </h2>
          <div className="address-options">
            {addresses.map((a) => (
              <label key={a.id} className={"address-option" + (selected === a.id ? " selected" : "")}>
                <input
                  type="radio"
                  name="addressChoice"
                  checked={selected === a.id}
                  onChange={() => setSelected(a.id)}
                />
                <span>
                  <b>{a.name}</b> {a.isDefault && <em className="tag">Default</em>}
                  <br />
                  {[a.line1, a.line2, a.city, a.state].filter(Boolean).join(", ")} — {a.pincode}
                  <br />
                  <small>{formatIndianMobile(a.phone.startsWith("+") ? a.phone : `+91${a.phone}`)}</small>
                </span>
              </label>
            ))}
            <label className={"address-option" + (selected === "new" ? " selected" : "")}>
              <input
                type="radio"
                name="addressChoice"
                checked={selected === "new"}
                onChange={() => setSelected("new")}
              />
              <span>
                <Plus size={14} /> Deliver to a new address
              </span>
            </label>
          </div>
          {selected === "new" && (
            <div className="new-address">
              <AddressFields showDefault={false} />
              <label className="check">
                <input type="checkbox" name="save" defaultChecked /> Save this address to my account
              </label>
            </div>
          )}
        </section>
        <section className="checkout-step">
          <h2>Contact</h2>
          <p className="muted">Order confirmation and updates go to {email}.</p>
        </section>
      </div>

      <aside className="order-summary">
        <h2>Your order</h2>
        {loading ? (
          <p className="muted">
            <Loader2 className="spin" size={16} /> Loading…
          </p>
        ) : (
          <ul className="summary-lines">
            {bag.map((l) => {
              const p = products.find((x) => x.id === l.productId);
              return p ? (
                <li key={l.productId + l.size}>
                  <img src={p.image} alt="" />
                  <span>
                    {p.name}
                    <small>
                      Size {l.size} × {l.quantity}
                    </small>
                  </span>
                  <b>{money(p.price * l.quantity)}</b>
                </li>
              ) : null;
            })}
          </ul>
        )}
        <div className="subtotal">
          <span>Items ({count})</span>
          <b>{money(subtotal)}</b>
        </div>
        <div className="subtotal">
          <span>Shipping</span>
          <b>{shipping ? money(shipping) : "Free"}</b>
        </div>
        <div className="subtotal total">
          <span>Total</span>
          <b>{money(subtotal + shipping)}</b>
        </div>
        {problems && !loading && (
          <p className="form-error">
            Some items changed. <Link href="/cart">Review your bag</Link>.
          </p>
        )}
        <button className="primary" disabled={busy || loading || problems}>
          {busy ? <Loader2 className="spin" size={17} /> : <Lock size={17} />} Pay{" "}
          {money(subtotal + shipping)}
        </button>
        <small className="muted">Secure payment by Razorpay · UPI, cards, netbanking and wallets.</small>
      </aside>
    </form>
  );
}
