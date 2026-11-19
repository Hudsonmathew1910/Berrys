import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listAddresses } from "@/lib/addresses";
import { getViewer } from "@/lib/auth";
import { firebaseConfig } from "@/lib/firebase-verify";
import { CheckoutView } from "@/components/shop/checkout-view";

export const metadata: Metadata = { title: "Checkout — Berry’s", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/checkout");
  // Buying needs a Google email (and a verified mobile when mobile login is on).
  if (!viewer.email || (firebaseConfig() && !viewer.phone)) redirect("/login?link=1&next=/checkout");
  const addresses = await listAddresses(viewer.userId);

  return (
    <div className="page-section">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link> / <Link href="/cart">Bag</Link> / Checkout
      </nav>
      <h1 className="page-title">Checkout</h1>
      <CheckoutView
        email={viewer.email}
        addresses={addresses.map(({ id, name, phone, line1, line2, city, state, pincode, isDefault }) => ({
          id,
          name,
          phone,
          line1,
          line2,
          city,
          state,
          pincode,
          isDefault,
        }))}
      />
    </div>
  );
}
