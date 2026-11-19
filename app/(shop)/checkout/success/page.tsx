import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { getViewer } from "@/lib/auth";
import { money } from "@/lib/catalog";
import { orderForUser } from "@/lib/store-data";

export const metadata: Metadata = { title: "Thank you — Berry’s", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/account/orders");
  const id = (await searchParams).order ?? "";
  const order = id ? await orderForUser(viewer.userId, id) : null;

  return (
    <div className="page-section narrow">
      <div className="order-success page-success">
        {order ? <CheckCircle2 size={56} /> : <Clock size={56} />}
        <h1>{order ? "One happy little order." : "Confirming your payment…"}</h1>
        {order?.status === "needs_refund" ? (
          <p>
            Your payment for order <b>{order.id}</b> arrived after the stock sold out. We’ll refund you in
            full — no action needed.
          </p>
        ) : order?.isDemo ? (
          <p>
            <b>Demo order {order.id}</b> placed ({money(order.total)}) — no payment was taken. We’ve emailed a
            demo confirmation to {order.email}. This order is deleted automatically after 1 minute.
          </p>
        ) : order ? (
          <p>
            Thank you! Order <b>{order.id}</b> is confirmed ({money(order.total)}). We’ll email {order.email}{" "}
            when it ships.
          </p>
        ) : (
          <p>
            We’re waiting for the payment confirmation. It usually takes a few seconds — your order will
            appear in My orders.
          </p>
        )}
        <div className="success-actions">
          {order && (
            <Link className="primary" href={`/account/orders/${encodeURIComponent(order.id)}`}>
              View order details <ArrowRight size={17} />
            </Link>
          )}
          <Link className="outline" href="/shop">
            Keep shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
