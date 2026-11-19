import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShoppingBag } from "lucide-react";
import { getViewer } from "@/lib/auth";
import { money } from "@/lib/catalog";
import { ordersForUser } from "@/lib/store-data";
import { statusLabels } from "@/components/admin/types";

export const metadata: Metadata = { title: "My orders — Berry’s", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const viewer = (await getViewer())!;
  const orders = await ordersForUser(viewer.userId);

  return (
    <>
      <h1 className="page-title">My orders</h1>
      {!orders.length ? (
        <div className="empty-state">
          <ShoppingBag size={36} />
          <h3>No orders yet.</h3>
          <p>Orders you place will appear here, with shipping updates.</p>
          <Link className="primary" href="/shop">
            Start shopping <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <div className="account-orders">
          {orders.map((o) => (
            <Link key={o.id} href={`/account/orders/${encodeURIComponent(o.id)}`} className="account-order">
              <header>
                <div>
                  <b>{o.id}</b>
                  <small>{o.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}</small>
                </div>
                <span className={"status-pill status-" + o.status}>{statusLabels[o.status]}</span>
              </header>
              <p className="muted">
                {o.items.map((i) => `${i.name} (${i.size}) × ${i.quantity}`).join(" · ")}
              </p>
              <footer>
                <span>
                  {o.items.reduce((a, i) => a + i.quantity, 0)} items · <b>{money(o.total)}</b>
                </span>
                <span className="text-link">
                  Details <ArrowRight size={14} />
                </span>
              </footer>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
