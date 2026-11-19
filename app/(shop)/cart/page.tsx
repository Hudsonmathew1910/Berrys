import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { CartView } from "@/components/shop/cart-view";

export const metadata: Metadata = { title: "Your bag — Berry’s", robots: { index: false } };

export default async function CartPage() {
  const viewer = await getViewer();
  return (
    <div className="page-section">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link> / Bag
      </nav>
      <h1 className="page-title">Your little bag</h1>
      <CartView loggedIn={!!viewer} />
    </div>
  );
}
