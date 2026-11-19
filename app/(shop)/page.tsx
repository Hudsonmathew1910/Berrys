import Link from "next/link";
import { ArrowRight, ArrowUpRight, Package } from "lucide-react";
import { categories, money } from "@/lib/catalog";
import { categoryCounts, queryProducts } from "@/lib/store-data";
import { ProductCard } from "@/components/shop/product-card";

export const dynamic = "force-dynamic";

const shopHref = (c: string) => (c === "All pieces" ? "/shop" : `/shop?category=${encodeURIComponent(c)}`);

export default async function HomePage() {
  const cats = categories.slice(1);
  const [newIn, counts, ...firsts] = await Promise.all([
    queryProducts({ sort: "new", perPage: 8 }),
    categoryCounts(),
    ...cats.map((c) => queryProducts({ category: c, perPage: 1, sort: "price-low" })),
  ]);
  const first = Object.fromEntries(cats.map((c, i) => [c, firsts[i].products[0]]));
  const total = Object.values(counts).reduce((a, n) => a + n, 0);

  return (
    <>
      <div className="shopping-home">
        <section className="category-shelf" aria-label="Shop by category">
          <div className="shelf-title">
            <h1>Find their next favourite.</h1>
            <span>Little outfits. Plenty of choice.</span>
          </div>
          <div className="category-shortcuts">
            {categories.map((c, i) => {
              const p = c === "All pieces" ? newIn.products[0] : first[c];
              return (
                <Link className="category-shortcut" key={c} href={shopHref(c)}>
                  <div className={"shortcut-image shortcut-" + i}>
                    {p ? <img src={p.image} alt="" /> : <Package size={26} />}
                  </div>
                  <div>
                    <b>{c === "All pieces" ? "Explore all" : c}</b>
                    <span>
                      {c === "All pieces" ? total : (counts[c] ?? 0)} pieces <ArrowUpRight size={11} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="shopping-highlights" aria-label="Featured collections">
          {first["Co-ord sets"] && (
            <Link className="shopping-banner main-shopping-banner" href={shopHref("Co-ord sets")}>
              <div className="banner-copy">
                <span className="eyebrow">THE EVERYDAY WARDROBE</span>
                <h2>
                  Big on comfort.
                  <br />
                  <em>Little on fuss.</em>
                </h2>
                <p>Ready-to-play co-ord sets</p>
                <strong>From {money(first["Co-ord sets"].price)}</strong>
                <span className="banner-cta">
                  Shop co-ords <ArrowRight size={16} />
                </span>
              </div>
              <div className="banner-product">
                <img src={first["Co-ord sets"].image} alt={first["Co-ord sets"].name} />
              </div>
              <span className="banner-corner">THE BERRY’S EDIT</span>
            </Link>
          )}
          {(["Dresses", "Sleepwear"] as const).map((c, i) =>
            first[c] ? (
              <Link
                key={c}
                className={"shopping-banner small-shopping-banner banner-tone-" + i}
                href={shopHref(c)}
              >
                <div className="banner-copy">
                  <span className="eyebrow">{i ? "BEDTIME FAVOURITES" : "TWIRL-READY FINDS"}</span>
                  <h2>{i ? "Dream a little." : "Dress up the day."}</h2>
                  <strong>From {money(first[c].price)}</strong>
                  <span className="banner-cta">
                    Shop {c.toLowerCase()} <ArrowRight size={14} />
                  </span>
                </div>
                <img src={first[c].image} alt={first[c].name} />
              </Link>
            ) : null,
          )}
        </section>
      </div>

      <section className="collection page-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">JUST LANDED</div>
            <h2>New little favourites</h2>
          </div>
          <Link className="text-link" href="/shop?sort=new">
            View all <ArrowRight size={16} />
          </Link>
        </div>
        {newIn.products.length ? (
          <div className="product-grid">
            {newIn.products.map((p, i) => (
              <ProductCard key={p.id} product={p} eager={i < 4} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Package size={36} />
            <h3>Our collection is on its way.</h3>
            <p>Check back soon for little favourites.</p>
          </div>
        )}
      </section>

      <section className="story-block">
        <div className="story-photo">
          <img
            src={newIn.products[1]?.image ?? "/images/product-5.webp"}
            alt="Everyday adventures"
            loading="lazy"
          />
          <span>THE DETAILS MAKE THE DIFFERENCE.</span>
        </div>
        <div className="story-copy">
          <div className="eyebrow">THE HEART OF BERRY’S</div>
          <h2>
            Childhood is fleeting.
            <br />
            <em>Let them live in it.</em>
          </h2>
          <p>
            Clothes for cartwheels. For collecting pebbles. For the days that turn into the stories you tell.
            Berry’s is a little celebration of it all.
          </p>
          <Link className="text-link" href="/help/our-story">
            Get to know Berry’s <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
    </>
  );
}
