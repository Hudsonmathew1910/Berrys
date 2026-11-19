"use client";
import { ArrowRight, ArrowUpRight, Package } from "lucide-react";
import { categories, money, type Product } from "@/lib/catalog";

const fromPrice = (items: Product[]) => money(Math.min(...items.map((p) => p.price)));

/** Category shortcuts and featured banners shown on the unfiltered homepage. */
export function ShopHome({ products, onShop }: { products: Product[]; onShop: (category: string) => void }) {
  const inCategory = (c: string) => products.filter((p) => p.category === c);
  const coords = inCategory("Co-ord sets");

  return (
    <div className="shopping-home">
      <section className="category-shelf" aria-label="Shop by category">
        <div className="shelf-title">
          <h1>Find their next favourite.</h1>
          <span>Little outfits. Plenty of choice.</span>
        </div>
        <div className="category-shortcuts">
          {categories.map((c, i) => {
            const all = c === "All pieces";
            const p = all ? products[1] : inCategory(c)[0];
            return (
              <button className="category-shortcut" key={c} onClick={() => onShop(c)}>
                <div className={"shortcut-image shortcut-" + i}>
                  {p ? <img src={p.image} alt="" /> : <Package size={26} />}
                </div>
                <div>
                  <b>{all ? "Explore all" : c}</b>
                  <span>
                    {all ? products.length : inCategory(c).length} pieces <ArrowUpRight size={11} />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="shopping-highlights" aria-label="Featured collections">
        {coords[0] && (
          <button className="shopping-banner main-shopping-banner" onClick={() => onShop("Co-ord sets")}>
            <div className="banner-copy">
              <span className="eyebrow">THE EVERYDAY WARDROBE</span>
              <h2>
                Big on comfort.
                <br />
                <em>Little on fuss.</em>
              </h2>
              <p>Ready-to-play co-ord sets</p>
              <strong>From {fromPrice(coords)}</strong>
              <span className="banner-cta">
                Shop co-ords <ArrowRight size={16} />
              </span>
            </div>
            <div className="banner-product">
              <img src={coords[0].image} alt={coords[0].name} />
            </div>
            <span className="banner-corner">THE BERRY’S EDIT</span>
          </button>
        )}
        {(["Dresses", "Sleepwear"] as const).map((c, i) => {
          const range = inCategory(c);
          if (!range[0]) return null;
          return (
            <button
              className={"shopping-banner small-shopping-banner banner-tone-" + i}
              key={c}
              onClick={() => onShop(c)}
            >
              <div className="banner-copy">
                <span className="eyebrow">{i ? "BEDTIME FAVOURITES" : "TWIRL-READY FINDS"}</span>
                <h2>{i ? "Dream a little." : "Dress up the day."}</h2>
                <strong>From {fromPrice(range)}</strong>
                <span className="banner-cta">
                  Shop {c.toLowerCase()} <ArrowRight size={14} />
                </span>
              </div>
              <img src={range[0].image} alt={range[0].name} />
            </button>
          );
        })}
      </section>
    </div>
  );
}
