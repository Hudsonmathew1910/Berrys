"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Heart, Search, ShoppingBag, User } from "lucide-react";

/** What the Website content page sends: everything on it as it is right now (saved or not). */
export type TemplateContent = {
  announcement: string[];
  home: Record<string, string>;
  banners: Record<string, string>[];
  sections: { shelfCategories: string[]; offers: string[]; offersTitle: string };
  footer: Record<string, string>;
};
/** Where an edit made on the template goes back to: a content form and one of its fields. */
export type EditTarget = { form: string; field: string };
export const PREVIEW_MESSAGE = "berrys-content-preview";

type Fixed = {
  brand: { name: string; logo: string };
  categories: { name: string; description: string }[];
  products: { id: string; category: string; image: string }[];
  offers: { id: string; name: string; label: string; covers: string; live: boolean }[];
};

/**
 * Text you can click and type into. It reports each change to the dashboard (which fills the
 * matching form field); while you type, updates coming back don't move the cursor.
 */
function E({ value, to, multiline = false }: { value: string; to: EditTarget; multiline?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerText !== value) el.innerText = value;
  }, [value]);
  return (
    <span
      ref={ref}
      className="tpl-edit"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      title="Click to edit"
      onInput={(e) =>
        window.parent.postMessage(
          { type: PREVIEW_MESSAGE, edit: to, value: e.currentTarget.innerText },
          window.location.origin,
        )
      }
      onKeyDown={(e) => {
        if (e.key === "Enter" && !multiline) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/** Grey box where a photo or product would be. */
const Box = ({ className = "" }: { className?: string }) => <span className={"tpl-box " + className} />;

function ProductPlaceholder() {
  return (
    <article className="product-card tpl-product">
      <div className="product-image">
        <Box className="tpl-photo" />
      </div>
      <div className="product-category">
        <span className="tpl-line short" />
      </div>
      <span className="tpl-line" />
      <span className="tpl-line price" />
    </article>
  );
}

/**
 * The home page as a template: your text, banner photos and logo in the site's real styles,
 * grey boxes for products and category photos, and nothing clickable.
 */
export function HomeTemplate({ fixed, initial }: { fixed: Fixed; initial: TemplateContent }) {
  const [c, setC] = useState(initial);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== PREVIEW_MESSAGE || !e.data.content) return;
      setC(e.data.content as TemplateContent);
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: PREVIEW_MESSAGE, ready: true }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const cats = fixed.categories.map((x) => x.name);
  const shelf = c.sections.shelfCategories.length
    ? cats.filter((x) => c.sections.shelfCategories.includes(x))
    : cats;
  const offers = (
    c.sections.offers.length
      ? fixed.offers.filter((o) => c.sections.offers.includes(o.id))
      : fixed.offers.filter((o) => o.live)
  ).slice(0, 6);
  const banners = c.banners.slice(0, 3).map((b, i): Record<string, string> => {
    const product = fixed.products.find((p) => p.id === b.productId);
    const category = cats.includes(b.category) ? b.category : (product?.category ?? cats[i] ?? "");
    const image =
      b.image || product?.image || fixed.products.find((p) => p.category === category)?.image || "";
    return {
      ...b,
      eyebrow: b.eyebrow || category.toUpperCase(),
      title: b.title || fixed.categories.find((x) => x.name === category)?.description || category,
      cta: b.cta || `Shop ${category.toLowerCase()}`,
      image,
    };
  });

  return (
    <div
      className="tpl-root"
      // Nothing on the template does anything except editing text.
      onClickCapture={(e) => {
        if (!(e.target as HTMLElement).closest(".tpl-edit")) e.preventDefault();
      }}
      onSubmitCapture={(e) => e.preventDefault()}
    >
      {c.announcement.some(Boolean) && (
        <div className="announcement">
          {c.announcement.map((t, i) => (
            <span key={i}>
              <E value={t} to={{ form: "announcement", field: `item${i}` }} />
            </span>
          ))}
        </div>
      )}
      <header className="site-header">
        <span className="site-brand">
          <span className="brand-mark">
            <img src={fixed.brand.logo || "/images/berrys-mark.webp"} alt="" />
          </span>
          <span className="brand-word">
            <b>{fixed.brand.name.toUpperCase()}</b>
            <small>CLOTHING BRAND</small>
          </span>
        </span>
        <span className="store-search">
          <Search size={19} />
          <input
            disabled
            placeholder="Search co-ords, dresses, pyjamas & more"
            aria-label="Search (template)"
          />
          <span className="search-submit">Search</span>
        </span>
        <nav className="header-actions" aria-label="Account (template)">
          {[
            [User, "Sign in"],
            [Heart, "Favourites"],
            [ShoppingBag, "Bag"],
          ].map(([Icon, label]) => {
            const I = Icon as typeof User;
            return (
              <span key={label as string} className="shop-header-action">
                <span className="action-symbol">
                  <I size={20} />
                </span>
                <span className="action-label">{label as string}</span>
              </span>
            );
          })}
        </nav>
      </header>
      <nav className="site-nav" aria-label="Collections (template)">
        <span className="active">Shop all</span>
        {cats.map((x) => (
          <span key={x}>{x}</span>
        ))}
      </nav>

      <main className="site-main">
        <div className="shopping-home">
          <section className="category-shelf">
            <div className="shelf-title">
              <h1>
                <E value={c.home.shelfTitle ?? ""} to={{ form: "home", field: "shelfTitle" }} />
              </h1>
              <span>
                <E value={c.home.shelfSubtitle ?? ""} to={{ form: "home", field: "shelfSubtitle" }} />
              </span>
            </div>
            <div className="category-shortcuts">
              {["All pieces", ...shelf].map((x, i) => (
                <span className="category-shortcut" key={x}>
                  <div className={"shortcut-image shortcut-" + i}>
                    <Box />
                  </div>
                  <div>
                    <b>{x === "All pieces" ? "Explore all" : x}</b>
                    <span>
                      ·· pieces <ArrowUpRight size={11} />
                    </span>
                  </div>
                </span>
              ))}
            </div>
          </section>

          <section className="shopping-highlights">
            {banners.map((bn, i) => (
              <span
                key={i}
                className={
                  "shopping-banner " +
                  (i === 0 ? "main-shopping-banner" : "small-shopping-banner banner-tone-" + (i - 1))
                }
              >
                <div className="banner-copy">
                  <span className="eyebrow">
                    <E value={bn.eyebrow} to={{ form: "banners", field: `b${i}_eyebrow` }} />
                  </span>
                  <h2>
                    <E value={bn.title} to={{ form: "banners", field: `b${i}_title` }} />
                    {(bn.titleEm || i === 0) && (
                      <>
                        <br />
                        <em>
                          <E value={bn.titleEm} to={{ form: "banners", field: `b${i}_titleEm` }} />
                        </em>
                      </>
                    )}
                  </h2>
                  {(bn.text || i === 0) && (
                    <p>
                      <E value={bn.text} to={{ form: "banners", field: `b${i}_text` }} />
                    </p>
                  )}
                  <strong>From ₹···</strong>
                  <span className="banner-cta">
                    <E value={bn.cta} to={{ form: "banners", field: `b${i}_cta` }} />{" "}
                    <ArrowRight size={i === 0 ? 16 : 14} />
                  </span>
                </div>
                {i === 0 ? (
                  <>
                    <div className="banner-product">{bn.image ? <img src={bn.image} alt="" /> : <Box />}</div>
                    <span className="banner-corner">THE BERRY’S EDIT</span>
                  </>
                ) : bn.image ? (
                  <img src={bn.image} alt="" />
                ) : (
                  <Box />
                )}
              </span>
            ))}
          </section>
        </div>

        {offers.length > 0 && (
          <section className="page-section home-offers">
            <div className="section-heading">
              <div>
                <div className="eyebrow">OFFERS</div>
                <h2>
                  <E value={c.sections.offersTitle} to={{ form: "homeSections", field: "offersTitle" }} />
                </h2>
              </div>
              <span className="text-link">
                Everything on sale <ArrowRight size={16} />
              </span>
            </div>
            <div className="offer-strip">
              {offers.map((o) => (
                <span key={o.id} className="offer-tile">
                  <span className="offer-tile-amount">{o.label}</span>
                  <b>{o.name}</b>
                  <small>{o.covers}</small>
                  <span className="offer-tile-cta">
                    Shop the offer <ArrowRight size={14} />
                  </span>
                </span>
              ))}
            </div>
            <h3 className="home-subheading">On sale now</h3>
            <div className="product-grid">
              {[0, 1, 2, 3].map((k) => (
                <ProductPlaceholder key={k} />
              ))}
            </div>
          </section>
        )}

        <section className="collection page-section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">NEW ARRIVALS</div>
              <h2>
                <E value={c.home.newInTitle ?? ""} to={{ form: "home", field: "newInTitle" }} />
              </h2>
            </div>
            <span className="text-link">
              View all <ArrowRight size={16} />
            </span>
          </div>
          <div className="product-grid">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
              <ProductPlaceholder key={k} />
            ))}
          </div>
        </section>

        <section className="story-block">
          <div className="story-photo">
            <Box />
            <span>THE DETAILS MAKE THE DIFFERENCE.</span>
          </div>
          <div className="story-copy">
            <div className="eyebrow">
              <E value={c.home.storyEyebrow ?? ""} to={{ form: "home", field: "storyEyebrow" }} />
            </div>
            <h2>
              <E value={c.home.storyTitle ?? ""} to={{ form: "home", field: "storyTitle" }} />
              <br />
              <em>
                <E value={c.home.storyTitleEm ?? ""} to={{ form: "home", field: "storyTitleEm" }} />
              </em>
            </h2>
            <p>
              <E value={c.home.storyText ?? ""} to={{ form: "home", field: "storyText" }} multiline />
            </p>
            <span className="text-link">
              Get to know Berry’s <ArrowUpRight size={18} />
            </span>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-top">
          <div className="footer-brand">
            {fixed.brand.logo ? (
              <span className="footer-brand-custom">
                <img src={fixed.brand.logo} alt="" />
                <b>{fixed.brand.name.toUpperCase()}</b>
              </span>
            ) : (
              <img src="/images/berrys-logo-full.webp" alt="" />
            )}
            <p>
              <E value={c.footer.tagline ?? ""} to={{ form: "footer", field: "tagline" }} />
            </p>
          </div>
          <div>
            <h4>THE LITTLE WARDROBE</h4>
            {cats.slice(0, 6).map((x) => (
              <span key={x} className="tpl-footer-link">
                {x}
              </span>
            ))}
          </div>
          <div>
            <h4>HERE TO HELP</h4>
            {["Size guide", "Shipping & returns", "Get in touch", "Track my order"].map((x) => (
              <span key={x} className="tpl-footer-link">
                {x}
              </span>
            ))}
          </div>
          <div className="footer-note">
            <span className="eyebrow">A LITTLE NOTE</span>
            <h3>
              <E value={c.footer.noteTitle ?? ""} to={{ form: "footer", field: "noteTitle" }} />
            </h3>
            <p>
              <E value={c.footer.noteText ?? ""} to={{ form: "footer", field: "noteText" }} />
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
