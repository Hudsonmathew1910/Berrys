"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Heart, Minus, Plus, ShoppingBag } from "lucide-react";
import { isSoldOut, sizes, type Product } from "@/lib/catalog";
import { addToBag, toggleLike, useBag, useLikes } from "@/components/store/bag";
import { useToast } from "@/components/store/toast";

/** Size picker, quantity and "Add to bag" for the product page. */
export function AddToBag({ product }: { product: Product }) {
  const bag = useBag();
  const likes = useLikes();
  const toast = useToast();
  const [size, setSize] = useState(sizes.find((s) => product.stock[s] > 0) ?? "");
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const soldOut = isSoldOut(product);
  const available = size ? (product.stock[size] ?? 0) : 0;
  const liked = likes.includes(product.id);

  function add() {
    const problem = addToBag(bag, product, size, qty);
    if (problem) return toast(problem);
    setAdded(true);
    toast("A little favourite, added to your bag.");
  }

  return (
    <div className="add-to-bag">
      <div className="size-heading">
        <b>Pick their size</b>
        <Link className="text-link" href="/help/size-guide">
          Size guide <ArrowUpRight size={13} />
        </Link>
      </div>
      <div className="size-buttons">
        {sizes.map((s) => (
          <button
            key={s}
            type="button"
            disabled={!product.stock[s]}
            className={size === s ? "active" : ""}
            onClick={() => {
              setSize(s);
              setQty(1);
              setAdded(false);
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
            {available <= 3 ? `Only ${available} left in ${size}` : `In stock in ${size}`}
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
        <button className="primary" disabled={!available} onClick={add}>
          {soldOut ? "Sold out" : "Add to bag"} <ShoppingBag size={17} />
        </button>
        <button
          type="button"
          className={"icon-btn like-btn " + (liked ? "liked" : "")}
          aria-label={liked ? "Remove from favourites" : "Save to favourites"}
          aria-pressed={liked}
          onClick={() => toggleLike(product.id)}
        >
          <Heart size={19} fill={liked ? "currentColor" : "none"} />
        </button>
      </div>
      {added && (
        <div className="added-note">
          Added to your bag.{" "}
          <Link className="text-link" href="/cart">
            View bag & checkout
          </Link>
        </div>
      )}
    </div>
  );
}
