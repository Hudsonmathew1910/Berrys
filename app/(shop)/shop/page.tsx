import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { getCategories } from "@/lib/categories";
import { allSizes, liveOffers, queryProducts, type ProductQuery } from "@/lib/store-data";
import { offerEndsText } from "@/lib/catalog";
import { Pagination } from "@/components/shop/pagination";
import { ProductCard } from "@/components/shop/product-card";
import { ShopFilters } from "@/components/shop/shop-filters";

export const dynamic = "force-dynamic";

type Params = {
  category?: string;
  q?: string;
  sort?: string;
  size?: string;
  stock?: string;
  gender?: string;
  page?: string;
  /** "1" = only discounted pieces */
  sale?: string;
  /** one live offer's pieces */
  offer?: string;
};

const sorts = ["featured", "new", "price-low", "price-high", "name"] as const;
const PER_PAGE = 12;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Params>;
}): Promise<Metadata> {
  const { category, q } = await searchParams;
  return { title: `${q ? `“${q}”` : category || "Shop all"} — Berry’s` };
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const [catList, sizeList, offers] = await Promise.all([getCategories(), allSizes(), liveOffers()]);
  const offer = offers.find((o) => o.id === sp.offer);
  const sale = !offer && sp.sale === "1";
  const categories = ["All pieces", ...catList.map((c) => c.name)];
  const category = categories.slice(1).includes(sp.category ?? "") ? sp.category : undefined;
  const gender = sp.gender === "girls" || sp.gender === "boys" ? sp.gender : undefined;
  const sort = sorts.includes(sp.sort as never) ? (sp.sort as ProductQuery["sort"]) : "featured";
  const size = sizeList.includes(sp.size ?? "") ? sp.size : undefined;
  const q = sp.q?.trim().slice(0, 80) || undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const result = await queryProducts({
    category,
    q,
    gender,
    sort,
    size,
    inStock: sp.stock === "1",
    onSale: sale,
    offerId: offer?.id,
    page,
    perPage: PER_PAGE,
  });
  const params = {
    category,
    q,
    gender,
    sort: sort === "featured" ? undefined : sort,
    size,
    stock: sp.stock,
    sale: sale ? "1" : undefined,
    offer: offer?.id,
  };
  // Past the last page (e.g. after filtering): go to the last real page.
  if (result.total > 0 && page > result.pages) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    if (result.pages > 1) qs.set("page", String(result.pages));
    redirect(qs.size ? `/shop?${qs}` : "/shop");
  }
  const from = (result.page - 1) * result.perPage + 1;
  const to = Math.min(result.total, result.page * result.perPage);

  return (
    <section className="collection page-section">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link> / <Link href="/shop">Shop</Link>
        {category && <> / {category}</>}
      </nav>
      <div className="collection-heading shopping-heading">
        <div>
          <div className="eyebrow">
            {offer ? `OFFER · ${offer.label.toUpperCase()}` : sale ? "ON SALE" : "THE BERRY’S COLLECTION"}
          </div>
          <h1>
            {q
              ? `Results for “${q}”`
              : offer
                ? offer.name
                : sale
                  ? "On sale now"
                  : (category ?? "Discover the collection")}
          </h1>
          {offer && <p className="muted">{offer.covers}</p>}
          {offer?.endsAt && <p className="offer-ends">{offerEndsText(offer.endsAt)}</p>}
        </div>
        <p>
          {result.total
            ? `Showing ${from}–${to} of ${result.total} pieces`
            : "Everyday favourites, all in one place."}
        </p>
      </div>

      <div className="category-tabs">
        <Link href="/shop?sale=1" className={"sale-tab" + (sale || offer ? " active" : "")}>
          On sale
        </Link>
        {categories.map((c) => {
          const active = c === "All pieces" ? !category && !sale && !offer : category === c;
          const href = c === "All pieces" ? "/shop" : `/shop?category=${encodeURIComponent(c)}`;
          return (
            <Link key={c} href={href} className={active ? "active" : ""}>
              {c}
            </Link>
          );
        })}
      </div>

      {(sale || offer) && offers.length > 0 && (
        <div className="category-tabs sale-tabs">
          <Link href="/shop?sale=1" className={sale ? "active" : ""}>
            All on sale
          </Link>
          {offers.map((o) => (
            <Link key={o.id} href={`/shop?offer=${o.id}`} className={offer?.id === o.id ? "active" : ""}>
              {o.name}
            </Link>
          ))}
        </div>
      )}

      <ShopFilters
        extra={{ sale: sale ? "1" : undefined, offer: offer?.id }}
        category={category}
        q={q}
        gender={gender}
        sort={sort ?? "featured"}
        size={size}
        sizes={sizeList}
        stock={sp.stock === "1"}
      />

      {result.products.length ? (
        <div className="product-grid">
          {result.products.map((p, i) => (
            <ProductCard key={p.id} product={p} eager={i < 4} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Search size={36} />
          <h3>No little favourites here yet.</h3>
          <p>Try another category, search or filter.</p>
          <Link className="primary" href="/shop">
            See all pieces
          </Link>
        </div>
      )}

      <Pagination page={result.page} pages={result.pages} basePath="/shop" params={params} />
    </section>
  );
}
