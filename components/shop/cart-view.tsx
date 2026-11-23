"use client";
import Link from "next/link";
import { ArrowRight, Loader2, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { money, shippingFor } from "@/lib/catalog";
import { bagStore, bagTotals, useBag } from "@/components/store/bag";
import { useToast } from "@/components/store/toast";
import { useProducts } from "./use-products";

/** The full bag page: lines, quantities, totals and the way to checkout. */
export function CartView({
  loggedIn,
  shippingRule,
}: {
  loggedIn: boolean;
  shippingRule: { fee: number; freeAbove: number };
}) {
  const bag = useBag();
  const toast = useToast();
  const { products, loading } = useProducts(bag.map((l) => l.productId));
  const { count, subtotal, saved } = bagTotals(bag, products);
  const shipping = shippingFor(subtotal, shippingRule);
  const problems = bag.some((l) => {
    const p = products.find((x) => x.id === l.productId);
    return !p || (p.stock[l.size] ?? 0) < l.quantity;
  });

  function setQty(i: number, n: number) {
    if (n < 1) return bagStore.set((b) => b.filter((_, j) => j !== i));
    const line = bag[i];
    const p = products.find((x) => x.id === line.productId);
    if (!p || n > (p.stock[line.size] ?? 0)) return toast("No more pieces available in this size.");
    bagStore.set((b) => b.map((x, j) => (j === i ? { ...x, quantity: n } : x)));
  }

  if (!bag.length) {
    return (
      <div className="empty-state page-empty">
        <ShoppingBag size={48} />
        <h2>Your bag is empty.</h2>
        <p>It’s waiting for its first little adventure.</p>
        <Link className="primary" href="/shop">
          Discover the collection <ArrowRight size={16} />
        </Link>
      </div>
    );
  }

  return (
    <div className="cart-layout">
      <div className="cart-lines">
        {loading && (
          <p className="muted">
            <Loader2 className="spin" size={16} /> Checking prices and stock…
          </p>
        )}
        {!loading &&
          bag.map((line, i) => {
            const p = products.find((x) => x.id === line.productId);
            if (!p) {
              return (
                <div key={line.productId + line.size} className="cart-line unavailable">
                  <p>This product is no longer available.</p>
                  <button className="text-link" onClick={() => setQty(i, 0)}>
                    Remove
                  </button>
                </div>
              );
            }
            const stock = p.stock[line.size] ?? 0;
            return (
              <div className="cart-line" key={p.id + line.size}>
                <Link href={`/products/${encodeURIComponent(p.id)}`}>
                  <img src={p.image} alt={p.name} />
                </Link>
                <div className="cart-line-info">
                  <small>{p.category}</small>
                  <Link href={`/products/${encodeURIComponent(p.id)}`}>
                    <h3>{p.name}</h3>
                  </Link>
                  <p>
                    Size {line.size} · {money(p.price)}
                    {p.price < p.basePrice && (
                      <>
                        {" "}
                        <del className="muted was-price">{money(p.basePrice)}</del>
                      </>
                    )}
                  </p>
                  {p.offer && <small className="offer-note">{p.offer}</small>}
                  {stock < line.quantity && (
                    <small className="form-error">
                      {stock
                        ? `Only ${stock} available — please reduce the quantity.`
                        : "Now sold out in this size."}
                    </small>
                  )}
                  <div className="bag-line-bottom">
                    <div className="quantity">
                      <button aria-label="Decrease quantity" onClick={() => setQty(i, line.quantity - 1)}>
                        <Minus size={13} />
                      </button>
                      <span>{line.quantity}</span>
                      <button aria-label="Increase quantity" onClick={() => setQty(i, line.quantity + 1)}>
                        <Plus size={13} />
                      </button>
                    </div>
                    <button className="icon-btn" aria-label={"Remove " + p.name} onClick={() => setQty(i, 0)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <b className="cart-line-total">{money(p.price * line.quantity)}</b>
              </div>
            );
          })}
      </div>

      <aside className="order-summary">
        <h2>Order summary</h2>
        <div className="subtotal">
          <span>Items ({count})</span>
          <b>{money(subtotal)}</b>
        </div>
        {saved > 0 && (
          <div className="subtotal offer-saving">
            <span>Offer savings</span>
            <b>−{money(saved)}</b>
          </div>
        )}{" "}
        <div className="subtotal">
          <span>Shipping</span>
          <b>{shipping ? money(shipping) : "Free"}</b>
        </div>
        <div className="subtotal total">
          <span>Total</span>
          <b>{money(subtotal + shipping)}</b>
        </div>
        {problems && !loading && <p className="form-error">Please fix the items marked above.</p>}
        <Link
          className={"primary" + (loading || problems ? " disabled" : "")}
          aria-disabled={loading || problems}
          href={loggedIn ? "/checkout" : "/login?next=/checkout"}
          onClick={(e) => (loading || problems) && e.preventDefault()}
        >
          {loggedIn ? "Proceed to checkout" : "Login to checkout"} <ArrowRight size={17} />
        </Link>
        <Link className="text-link" href="/shop">
          Continue shopping
        </Link>
      </aside>
    </div>
  );
}
