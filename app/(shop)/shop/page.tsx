import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { getCategories } from "@/lib/categories";
import { allSizes, queryProducts, type ProductQuery } from "@/lib/store-data";
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
  const [catList, sizeList] = await Promise.all([getCategories(), allSizes()]);
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
    page,
    perPage: PER_PAGE,
  });
  const params = { category, q, gender, sort: sort === "featured" ? undefined : sort, size, stock: sp.stock };
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
          <div className="eyebrow">THE BERRY’S COLLECTION</div>
          <h1>{q ? `Results for “${q}”` : (category ?? "Discover the collection")}</h1>
        </div>
        <p>
          {result.total
            ? `Showing ${from}–${to} of ${result.total} pieces`
            : "Everyday favourites, all in one place."}
        </p>
      </div>

      <div className="category-tabs">
        {categories.map((c) => {
          const active = c === "All pieces" ? !category : category === c;
          const href = c === "All pieces" ? "/shop" : `/shop?category=${encodeURIComponent(c)}`;
          return (
            <Link key={c} href={href} className={active ? "active" : ""}>
              {c}
            </Link>
          );
        })}
      </div>

      <ShopFilters
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
