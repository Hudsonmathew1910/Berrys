import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Leaf, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { discountPercent, money } from "@/lib/catalog";
import { getProduct, relatedProducts } from "@/lib/store-data";
import { AddToBag } from "@/components/shop/add-to-bag";
import { ProductCard } from "@/components/shop/product-card";
import { ProductGallery } from "@/components/shop/product-gallery";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProduct(decodeURIComponent((await params).id));
  if (!p) return { title: "Not found — Berry’s" };
  return {
    title: `${p.name} — Berry’s`,
    description: p.description.slice(0, 160),
    openGraph: { title: p.name, images: [p.image] },
  };
}

export default async function ProductPage({ params }: Props) {
  const product = await getProduct(decodeURIComponent((await params).id));
  if (!product) notFound();
  const related = await relatedProducts(product);
  const off = discountPercent(product);

  return (
    <div className="page-section">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link> / <Link href="/shop">Shop</Link> /{" "}
        <Link href={`/shop?category=${encodeURIComponent(product.category)}`}>{product.category}</Link> /{" "}
        {product.name}
      </nav>

      <div className="product-detail">
        <ProductGallery
          images={product.images}
          name={product.name}
          badge={product.offer ? "SALE" : product.badge}
        />
        <div className="product-detail-info">
          <div className="eyebrow">{product.category}</div>
          <h1>{product.name}</h1>
          <div className="price big">
            {money(product.price)}
            {off > 0 && (
              <>
                {" "}
                <del>{money(product.originalPrice)}</del>
                <span>{off}% off</span>
              </>
            )}
          </div>
          {product.offer && <div className="offer-note">{product.offer}</div>}
          <small className="muted">Inclusive of all taxes</small>
          <AddToBag product={product} />
          <div className="product-assurances">
            <div>
              <Truck size={18} /> Dispatched after payment is confirmed
            </div>
            <div>
              <RotateCcw size={18} /> Easy returns — <Link href="/help/shipping-returns">see policy</Link>
            </div>
            <div>
              <ShieldCheck size={18} /> Secure payments by Razorpay
            </div>
          </div>
          <div className="product-description">
            <h2>About this piece</h2>
            <p>{product.description}</p>
            <p className="muted">
              <Leaf size={14} /> Easy comfort, for everyday adventures.
            </p>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="collection related">
          <div className="section-heading">
            <div>
              <div className="eyebrow">MORE {product.category.toUpperCase()}</div>
              <h2>You may also like</h2>
            </div>
          </div>
          <div className="product-grid">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
