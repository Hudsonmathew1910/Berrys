import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, LogOut, ShoppingBag } from "lucide-react";
import { getViewer } from "@/lib/auth";
import { firebaseConfig } from "@/lib/firebase-verify";
import { money } from "@/lib/catalog";
import { formatIndianMobile } from "@/lib/phone";
import { ordersForUser } from "@/lib/store-data";
import { statusLabels } from "@/components/admin/types";

export const metadata: Metadata = { title: "My orders — Berry’s", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/account");
  const orders = await ordersForUser(viewer.userId);
  const phoneLogin = !!firebaseConfig();

  return (
    <main className="auth-page account-page">
      <div className="account-card">
        <div className="account-top">
          <Link href="/" className="auth-logo">
            <img src="/images/berrys-logo.png" alt="Berry’s" />
          </Link>
          <form action="/auth/signout" method="post">
            <button className="text-link" type="submit">
              <LogOut size={15} /> Log out
            </button>
          </form>
        </div>
        <div className="eyebrow">MY ACCOUNT</div>
        <h1>{viewer.name ? `Hello, ${viewer.name.split(" ")[0]}.` : "Your little orders."}</h1>
        <div className="account-identities">
          <div>
            <span>Google</span>{" "}
            {viewer.email ?? (
              <Link className="text-link" href="/login?link=1&next=/account">
                Link Google account
              </Link>
            )}
          </div>
          {(phoneLogin || viewer.phone) && (
            <div>
              <span>Mobile</span>{" "}
              {viewer.phone ? (
                formatIndianMobile(viewer.phone)
              ) : (
                <Link className="text-link" href="/login?link=1&next=/account">
                  Verify mobile number
                </Link>
              )}
            </div>
          )}
          {phoneLogin && !viewer.complete && (
            <small className="muted">Both are needed to place an order.</small>
          )}
        </div>

        {!orders.length ? (
          <div className="orders-empty">
            <ShoppingBag size={28} />
            <h3>No orders yet.</h3>
            <p>Orders you place while logged in will appear here.</p>
          </div>
        ) : (
          <div className="account-orders">
            {orders.map((o) => (
              <article key={o.id} className="account-order">
                <header>
                  <div>
                    <b>{o.id}</b>
                    <small>{o.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}</small>
                  </div>
                  <span className={"status-pill status-" + o.status}>{statusLabels[o.status]}</span>
                </header>
                <ul>
                  {o.items.map((i) => (
                    <li key={i.id}>
                      <span>
                        {i.name} · Size {i.size} × {i.quantity}
                      </span>
                      <span>{money(i.price * i.quantity)}</span>
                    </li>
                  ))}
                </ul>
                <footer>
                  <span>Total</span>
                  <b>{money(o.total)}</b>
                </footer>
              </article>
            ))}
          </div>
        )}

        <Link className="text-link" href="/">
          <ArrowLeft size={16} /> Back to the storefront
        </Link>
      </div>
    </main>
  );
}
