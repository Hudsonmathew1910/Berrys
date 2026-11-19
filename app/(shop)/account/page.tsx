import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { firebaseConfig } from "@/lib/firebase-verify";
import { formatIndianMobile } from "@/lib/phone";
import { ordersForUser } from "@/lib/store-data";
import { listAddresses } from "@/lib/addresses";
import { ProfileForm } from "@/components/shop/profile-form";

export const metadata: Metadata = { title: "My account — Berry’s", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AccountDetailsPage() {
  const viewer = (await getViewer())!;
  const phoneLogin = !!firebaseConfig();
  const [orders, addresses] = await Promise.all([ordersForUser(viewer.userId), listAddresses(viewer.userId)]);
  const def = addresses.find((a) => a.isDefault);

  return (
    <>
      <h1 className="page-title">Account details</h1>
      <div className="account-cards">
        <section className="account-card-box">
          <h2>Profile</h2>
          <ProfileForm initialName={viewer.name} />
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
                <dt>Mobile</dt>
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
          </dl>
        </section>
        <section className="account-card-box">
          <h2>At a glance</h2>
          <div className="glance">
            <Link href="/account/orders">
              <b>{orders.length}</b> orders
            </Link>
            <Link href="/account/addresses">
              <b>{addresses.length}</b> saved addresses
            </Link>
          </div>
          <h3>Default address</h3>
          {def ? (
            <p>
              {def.name}
              <br />
              {[def.line1, def.line2, def.city, def.state].filter(Boolean).join(", ")} — {def.pincode}
            </p>
          ) : (
            <p className="muted">
              No address yet. <Link href="/account/addresses">Add one</Link>
            </p>
          )}
        </section>
      </div>
    </>
  );
}
