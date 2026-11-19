import Link from "next/link";
import { ArrowRight, ArrowUpRight, Package } from "lucide-react";
import { money } from "@/lib/catalog";
import { getCategories } from "@/lib/categories";
import { getContent } from "@/lib/content";
import { categoryCounts, queryProducts } from "@/lib/store-data";
import { ProductCard } from "@/components/shop/product-card";

export const dynamic = "force-dynamic";

const shopHref = (c: string) => (c === "All pieces" ? "/shop" : `/shop?category=${encodeURIComponent(c)}`);

export default async function HomePage() {
  const [catList, text] = await Promise.all([getCategories(), getContent("home")]);
  const cats = catList.map((c) => c.name);
  const categories = ["All pieces", ...cats];
  // Featured banners: the first three categories in dashboard order.
  const [mainCat, ...smallCats] = cats.slice(0, 3);
  const describe = (name: string) => catList.find((c) => c.name === name)?.description;
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
            <h1>{text.shelfTitle}</h1>
            <span>{text.shelfSubtitle}</span>
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
          {mainCat && first[mainCat] && (
            <Link className="shopping-banner main-shopping-banner" href={shopHref(mainCat)}>
              <div className="banner-copy">
                <span className="eyebrow">{text.bannerEyebrow}</span>
                <h2>
                  {text.bannerTitle}
                  <br />
                  <em>{text.bannerTitleEm}</em>
                </h2>
                <p>{text.bannerText}</p>
                <strong>From {money(first[mainCat].price)}</strong>
                <span className="banner-cta">
                  Shop {mainCat.toLowerCase()} <ArrowRight size={16} />
                </span>
              </div>
              <div className="banner-product">
                <img src={first[mainCat].image} alt={first[mainCat].name} />
              </div>
              <span className="banner-corner">THE BERRY’S EDIT</span>
            </Link>
          )}
          {smallCats.map((c, i) =>
            first[c] ? (
              <Link
                key={c}
                className={"shopping-banner small-shopping-banner banner-tone-" + i}
                href={shopHref(c)}
              >
                <div className="banner-copy">
                  <span className="eyebrow">{c.toUpperCase()}</span>
                  <h2>{describe(c) || (i ? "Dream a little." : "Dress up the day.")}</h2>
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
            <h2>{text.newInTitle}</h2>
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
          <div className="eyebrow">{text.storyEyebrow}</div>
          <h2>
            {text.storyTitle}
            <br />
            <em>{text.storyTitleEm}</em>
          </h2>
          <p>{text.storyText}</p>
          <Link className="text-link" href="/help/our-story">
            Get to know Berry’s <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
    </>
  );
}
