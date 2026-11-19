"use client";
import { useState } from "react";
import { ArrowUpRight, Leaf, Minus, Plus, ShoppingBag, X } from "lucide-react";
import { isSoldOut, money, sizes, type Product } from "@/lib/catalog";
import { IconButton, Overlay } from "./modal";

type Props = {
  product: Product;
  initialSize?: string;
  onClose: () => void;
  onAdd: (size: string, quantity: number) => void;
  onSizeGuide: () => void;
};

export function ProductModal({ product, initialSize, onClose, onAdd, onSizeGuide }: Props) {
  const [size, setSize] = useState(initialSize ?? sizes.find((s) => product.stock[s] > 0) ?? "");
  const [qty, setQty] = useState(1);
  const soldOut = isSoldOut(product);
  const available = size ? (product.stock[size] ?? 0) : 0;

  return (
    <Overlay onClose={onClose}>
      <section className="product-modal modal" role="dialog" aria-modal="true" aria-label={product.name}>
        <IconButton className="modal-close" label="Close product details" onClick={onClose}>
          <X size={22} />
        </IconButton>
        <div className="modal-photo">
          <img src={product.image} alt={product.name} />
        </div>
        <div className="modal-product-info">
          <div className="eyebrow">{product.category}</div>
          <h2>{product.name}</h2>
          <div className="price big">
            {money(product.price)}{" "}
            {product.originalPrice > product.price && <del>{money(product.originalPrice)}</del>}
          </div>
          <p>{product.description}</p>

          <div className="size-heading">
            <b>Pick their size</b>
            <button className="text-link" onClick={onSizeGuide}>
              Size guide <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="size-buttons">
            {sizes.map((s) => (
              <button
                key={s}
                disabled={!product.stock[s]}
                className={size === s ? "active" : ""}
                onClick={() => {
                  setSize(s);
                  setQty(1);
                }}
              >
                {s}
                <small>{product.stock[s] ? "" : "Sold out"}</small>
              </button>
            ))}
          </div>

          <div className="availability">
            {available > 0 ? (
              <>
                <span />
                {available <= 3
                  ? `Only ${available} left in ${size}`
                  : `${available} pieces available in ${size}`}
              </>
            ) : (
              <span className="sold-message">
                {soldOut
                  ? "This little favourite is sold out in every size."
                  : "Please choose an available size."}
              </span>
            )}
          </div>

          <div className="add-row">
            <div className="quantity">
              <button aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQty((q) => q - 1)}>
                <Minus size={15} />
              </button>
              <span>{qty}</span>
              <button
                aria-label="Increase quantity"
                disabled={!size || qty >= available}
                onClick={() => setQty((q) => q + 1)}
              >
                <Plus size={15} />
              </button>
            </div>
            <button className="primary" disabled={!available || soldOut} onClick={() => onAdd(size, qty)}>
              {soldOut ? "Sold out" : "Add to little bag"}
              <ShoppingBag size={17} />
            </button>
          </div>
          <div className="product-assurance">
            <Leaf size={16} /> Easy comfort, for everyday adventures.
          </div>
        </div>
      </section>
    </Overlay>
  );
}
