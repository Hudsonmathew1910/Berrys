import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShoppingBag } from "lucide-react";
import { listAddresses } from "@/lib/addresses";
import { getViewer } from "@/lib/auth";
import { money } from "@/lib/catalog";
import { firebaseConfig } from "@/lib/firebase-verify";
import { statusLabels } from "@/lib/order-status";
import { refundStatusLabels } from "@/lib/refunds";
import { formatIndianMobile } from "@/lib/phone";
import { getSettings, shippingRule } from "@/lib/settings";
import { ordersForUser } from "@/lib/store-data";
import { AddressesManager } from "@/components/shop/addresses-manager";
import { CartView } from "@/components/shop/cart-view";
import { FavouritesView } from "@/components/shop/favourites-view";
import { ProfileForm } from "@/components/shop/profile-form";

export const metadata: Metadata = { title: "My account — Berry’s", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Everything about the account on one page; the side menu scrolls to each section. */
export default async function AccountPage() {
  const viewer = (await getViewer())!;
  const phoneLogin = !!firebaseConfig();
  const [orders, addresses, settings] = await Promise.all([
    ordersForUser(viewer.userId),
    listAddresses(viewer.userId),
    getSettings(),
  ]);

  return (
    <div className="account-sections">
      <section id="details" className="account-section">
        <h2 className="section-title">Account details</h2>
        <div className="account-cards">
          <div className="account-card-box">
            <ProfileForm initialName={viewer.name} initialPhone={viewer.contactPhone} />
          </div>
          <div className="account-card-box">
            <dl className="account-identities">
              <div>
                <dt>Google</dt>
                <dd>
                  {viewer.email ?? (
                    <Link className="text-link" href="/login?link=1&next=/account">
                      Link Google account
                    </Link>
                  )}
                </dd>
              </div>
              {(phoneLogin || viewer.phone) && (
                <div>
                  <dt>Verified mobile</dt>
                  <dd>
                    {viewer.phone ? (
                      formatIndianMobile(viewer.phone)
                    ) : (
                      <Link className="text-link" href="/login?link=1&next=/account">
                        Verify mobile number
                      </Link>
                    )}
                  </dd>
                </div>
              )}
              <div>
                <dt>Orders</dt>
                <dd>{orders.length}</dd>
              </div>
              <div>
                <dt>Addresses</dt>
                <dd>{addresses.length}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section id="orders" className="account-section">
        <h2 className="section-title">My orders</h2>
        {!orders.length ? (
          <div className="empty-state compact">
            <ShoppingBag size={30} />
            <p>No orders yet — orders you place appear here with shipping updates.</p>
            <Link className="primary" href="/shop">
              Start shopping <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <div className="account-orders">
            {orders.map((o) => (
              <Link key={o.id} href={`/account/orders/${encodeURIComponent(o.id)}`} className="account-order">
                <div className="order-top">
                  <div>
                    <b>{o.id}</b>
                    <small>{o.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}</small>
                  </div>
                  <span className={"status-pill status-" + o.status}>{statusLabels[o.status]}</span>
                  {o.isDemo && <span className="status-pill demo-pill">DEMO</span>}
                  {o.refundRequest && (
                    <span className={`status-pill refund-pill refund-${o.refundRequest}`}>
                      {refundStatusLabels[o.refundRequest]}
                    </span>
                  )}
                </div>
                <p className="muted">
                  {o.items.map((i) => `${i.name} (${i.size}) × ${i.quantity}`).join(" · ")}
                </p>
                <div className="order-foot">
                  <span>
                    {o.items.reduce((a, i) => a + i.quantity, 0)} items · <b>{money(o.total)}</b>
                  </span>
                  <span className="text-link">
                    Details <ArrowRight size={14} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section id="favourites" className="account-section">
        <h2 className="section-title">Favourites</h2>
        <FavouritesView />
      </section>

      <section id="addresses" className="account-section">
        <h2 className="section-title">Addresses</h2>
        <AddressesManager
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
      </section>

      <section id="bag" className="account-section">
        <h2 className="section-title">My bag</h2>
        <CartView loggedIn shippingRule={shippingRule(settings)} />
      </section>
    </div>
  );
}
