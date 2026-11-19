import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { getSettings, shippingRule } from "@/lib/settings";
import { CartView } from "@/components/shop/cart-view";

export const metadata: Metadata = { title: "Your bag — Berry’s", robots: { index: false } };

export default async function CartPage() {
  const [viewer, settings] = await Promise.all([getViewer(), getSettings()]);
  return (
    <div className="page-section">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link> / Bag
      </nav>
      <h1 className="page-title">Your little bag</h1>
      <CartView loggedIn={!!viewer} shippingRule={shippingRule(settings)} />
    </div>
  );
}
