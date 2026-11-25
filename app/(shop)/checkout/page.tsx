import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listAddresses } from "@/lib/addresses";
import { getViewer } from "@/lib/auth";
import { CheckoutView } from "@/components/shop/checkout-view";
import { paymentState } from "@/lib/orders";
import { getSettings, shippingRule } from "@/lib/settings";

export const metadata: Metadata = { title: "Checkout — Berry’s", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/checkout");
  // Buying needs an email on the account (older mobile-only accounts link Google first).
  if (!viewer.email) redirect("/login?link=1&next=/checkout");
  const [addresses, settings, payment] = await Promise.all([
    listAddresses(viewer.userId),
    getSettings(),
    paymentState(),
  ]);

  return (
    <div className="page-section">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link> / <Link href="/cart">Bag</Link> / Checkout
      </nav>
      <h1 className="page-title">Checkout</h1>
      <CheckoutView
        paymentsReady={payment.ready && !settings.maintenance}
        demo={payment.mode === "demo"}
        shippingRule={shippingRule(settings)}
        prefill={{ name: viewer.name, phone: viewer.contactPhone || viewer.phone || "" }}
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
