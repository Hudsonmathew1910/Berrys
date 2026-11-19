import Link from "next/link";
import { ArrowRight, ArrowUpRight, Package } from "lucide-react";
import { money } from "@/lib/catalog";
import { getCategories } from "@/lib/categories";
import { getContent } from "@/lib/content";
import { categoryCounts, cheapestPerCategory, queryProducts } from "@/lib/store-data";
import { ProductCard } from "@/components/shop/product-card";

export const dynamic = "force-dynamic";

const shopHref = (c: string) => (c === "All pieces" ? "/shop" : `/shop?category=${encodeURIComponent(c)}`);

export default async function HomePage() {
  const [catList, text, bannerText] = await Promise.all([
    getCategories(),
    getContent("home"),
    getContent("banners"),
  ]);
  const cats = catList.map((c) => c.name);
  const categories = ["All pieces", ...cats];
  const [newIn, counts, first] = await Promise.all([
    queryProducts({ sort: "new", perPage: 8 }),
    categoryCounts(),
    cheapestPerCategory(),
  ]);
  const total = Object.values(counts).reduce((a, n) => a + n, 0);

  // Featured banners (Dashboard → Website content). Blank category = the
  // category in that position; photo = uploaded image, else chosen product, else first product.
  const chosenIds = bannerText.items.map((b) => b.productId).filter(Boolean);
  const chosen = chosenIds.length ? (await queryProducts({ ids: chosenIds, perPage: 3 })).products : [];
  const banners = bannerText.items.slice(0, 3).map((b, i) => {
    const product = chosen.find((p) => p.id === b.productId);
    const category = cats.includes(b.category) ? b.category : (product?.category ?? cats[i]);
    if (!category) return null;
    const image = b.image || product?.image || first[category]?.image;
    if (!image) return null;
    return {
      ...b,
      eyebrow: b.eyebrow || category.toUpperCase(),
      title: b.title || catList.find((c) => c.name === category)?.description || category,
      cta: b.cta || `Shop ${category.toLowerCase()}`,
      href: shopHref(category),
      from: first[category]?.price,
      image,
      alt: product?.name ?? category,
    };
  });

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
          {banners.map((bn, i) =>
            bn ? (
              <Link
                key={i}
                className={
                  "shopping-banner " +
                  (i === 0 ? "main-shopping-banner" : "small-shopping-banner banner-tone-" + (i - 1))
                }
                href={bn.href}
              >
                <div className="banner-copy">
                  {bn.eyebrow && <span className="eyebrow">{bn.eyebrow}</span>}
                  <h2>
                    {bn.title}
                    {bn.titleEm && (
                      <>
                        <br />
                        <em>{bn.titleEm}</em>
                      </>
                    )}
                  </h2>
                  {bn.text && <p>{bn.text}</p>}
                  {bn.from && <strong>From {money(bn.from)}</strong>}
                  <span className="banner-cta">
                    {bn.cta} <ArrowRight size={i === 0 ? 16 : 14} />
                  </span>
                </div>
                {i === 0 ? (
                  <>
                    <div className="banner-product">
                      <img src={bn.image} alt={bn.alt} />
                    </div>
                    <span className="banner-corner">THE BERRY’S EDIT</span>
                  </>
                ) : (
                  <img src={bn.image} alt={bn.alt} />
                )}
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
