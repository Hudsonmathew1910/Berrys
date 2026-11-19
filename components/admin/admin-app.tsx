"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  LayoutDashboard,
  Loader2,
  LogOut,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import type { OrderStatus } from "@/db/schema";
import { emptyProduct, type Product } from "@/lib/catalog";
import { api, useStoreData } from "@/components/store/api";
import { Overlay } from "@/components/store/modal";
import { ToastProvider, useToast } from "@/components/store/toast";
import { StatsAndCharts } from "./dashboard-panels";
import { InventoryTable } from "./inventory-table";
import { OrdersTable } from "./orders-table";
import { ProductEditor } from "./product-editor";
import type { Overview } from "./types";

type Tab = "overview" | "products" | "analytics" | "orders";

const tabs: [Tab, string, typeof LayoutDashboard][] = [
  ["overview", "Overview", LayoutDashboard],
  ["products", "Products & inventory", Boxes],
  ["analytics", "Sales insights", BarChart3],
  ["orders", "Orders", ShoppingBag],
];

const headings: Record<Tab, [string, string]> = {
  overview: ["Hello, store owner.", "Here’s what’s happening in your Berry’s store."],
  products: ["Every piece, in place.", "Add beautiful pieces and manage stock for every size."],
  analytics: ["See what they love.", "Your fastest-moving categories, ranked by units sold."],
  orders: ["Little orders. Big smiles.", "Review, pack and ship the orders placed in your store."],
};

export default function AdminApp() {
  return (
    <ToastProvider>
      <AdminInner />
    </ToastProvider>
  );
}

function AdminInner() {
  const store = useStoreData();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<Overview>({ orders: [], ranking: [], paymentsMode: "test" });
  const [edit, setEdit] = useState<Product | null>(null);
  const [deleteId, setDeleteId] = useState("");
  const [busy, setBusy] = useState(false);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await api<Overview>("/api/admin/overview"));
    } catch (e) {
      toast((e as Error).message);
    }
  }, [toast]);

  useEffect(() => {
    if (!store.admin) return;
    let active = true;
    api<Overview>("/api/admin/overview")
      .then((o) => active && setOverview(o))
      .catch((e: Error) => active && toast(e.message));
    return () => {
      active = false;
    };
  }, [store.admin, toast]);

  const refreshAll = async () => {
    await Promise.all([store.refresh(), loadOverview()]);
  };

  async function run(task: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await task();
      await refreshAll();
      toast(success);
      return true;
    } catch (e) {
      toast((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const setup = () =>
    run(
      () => api("/api/admin/setup", { method: "POST", json: {} }),
      "Your owner account and sample inventory are ready.",
    );

  const remove = async () => {
    const ok = await run(
      () => api(`/api/admin/products/${encodeURIComponent(deleteId)}`, { method: "DELETE" }),
      "Product removed from the store.",
    );
    if (ok) setDeleteId("");
  };

  const updateStatus = (id: string, status: OrderStatus) =>
    run(
      () => api(`/api/admin/orders/${encodeURIComponent(id)}`, { method: "PATCH", json: { status } }),
      `Order ${id} updated.`,
    );

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/" className="admin-logo">
          <img src="/images/berrys-logo-full.webp" alt="Berry’s" />
        </Link>
        <div className="admin-label">STORE WORKSPACE</div>
        {tabs.map(([id, label, Icon]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            <Icon size={18} />
            {label}
          </button>
        ))}
        <div className="sidebar-bottom">
          <Link href="/">
            <ArrowUpRight size={18} />
            View storefront
          </Link>
          {store.viewer && (
            <form action="/auth/signout" method="post">
              <button type="submit">
                <LogOut size={17} />
                Log out
              </button>
            </form>
          )}
          <p>BERRY’S · EST. 2026</p>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-top">
          <span>
            Workspace <span>/</span> {tabs.find(([id]) => id === tab)![1]}
          </span>
          {store.viewer && (
            <span className="owner-pill">
              <span />
              {store.viewer.email || store.viewer.phone}
            </span>
          )}
        </header>

        {store.loading ? (
          <div className="empty-state">
            <Loader2 className="spin" />
            Loading your workspace…
          </div>
        ) : !store.admin ? (
          <div className="admin-welcome">
            <div className="welcome-symbol">
              <ShieldCheck size={34} />
            </div>
            <div className="eyebrow">YOUR STORE, BEAUTIFULLY IN ORDER</div>
            <h1>A little behind the scenes.</h1>
            <p>
              Manage your products, keep an eye on every size,
              <br />
              and discover what your customers love.
            </p>
            {store.error && <p className="form-error">{store.error}</p>}
            {!store.viewer ? (
              <Link className="primary" href="/login?next=/admin">
                Login to store admin <ArrowRight size={17} />
              </Link>
            ) : !store.viewer.email ? (
              <>
                <p className="form-error">The store owner logs in with Google.</p>
                <Link className="primary" href="/login?link=1&next=/admin">
                  Link your Google account <ArrowRight size={17} />
                </Link>
              </>
            ) : store.needsSetup ? (
              <>
                <button className="primary" onClick={setup} disabled={busy}>
                  {busy ? <Loader2 className="spin" size={18} /> : <ShieldCheck size={18} />}Set up my owner
                  account
                </button>
                <small>
                  This creates your admin account and loads the sample catalogue once. Only the store owner
                  can perform this step.
                </small>
              </>
            ) : (
              <p className="form-error">
                {store.viewer.email} does not have store administrator access. The owner logs in with the
                Google account set as STORE_OWNER_EMAIL.
              </p>
            )}
            <Link className="text-link" href="/">
              <ArrowLeft size={16} />
              Back to the storefront
            </Link>
          </div>
        ) : (
          <>
            <div className="admin-heading">
              <div>
                <div className="eyebrow">A LITTLE CLARITY, EVERY DAY</div>
                <h1>{headings[tab][0]}</h1>
                <p>{headings[tab][1]}</p>
              </div>
              {tab === "products" ? (
                <button className="primary" onClick={() => setEdit(structuredClone(emptyProduct))}>
                  <Plus size={18} />
                  Add product
                </button>
              ) : (
                <Link className="outline" href="/">
                  Visit store <ArrowUpRight size={16} />
                </Link>
              )}
            </div>

            {overview.paymentsMode !== "live" && (
              <div className="admin-notice">
                <span className="notice-dot" />
                {overview.paymentsMode === "mock"
                  ? "Simulated payments (PAYMENT_MODE=mock): checkout skips Razorpay so you can test orders locally. This never runs in production."
                  : overview.paymentsMode === "test"
                    ? "Razorpay test mode: payments use test cards/UPI and no real money moves. Switch to live keys when you launch."
                    : "Razorpay is not configured yet. Add your keys to the environment to accept payments."}
              </div>
            )}

            {(tab === "overview" || tab === "analytics") && (
              <StatsAndCharts
                products={store.products}
                overview={overview}
                onEdit={(p) => setEdit(structuredClone(p))}
                onManageInventory={() => setTab("products")}
              />
            )}
            {tab === "products" && (
              <InventoryTable
                products={store.products}
                onEdit={(p) => setEdit(structuredClone(p))}
                onDelete={setDeleteId}
              />
            )}
            {(tab === "orders" || tab === "overview") && (
              <OrdersTable
                orders={overview.orders}
                compact={tab === "overview"}
                busy={busy}
                onStatus={updateStatus}
              />
            )}
          </>
        )}
        <div className="admin-bottom">
          BERRY’S STORE WORKSPACE <span>Made for a little more peace of mind.</span>
        </div>
      </main>

      {edit && <ProductEditor initial={edit} onClose={() => setEdit(null)} onSaved={refreshAll} />}
      {deleteId && (
        <Overlay onClose={() => setDeleteId("")}>
          <div className="small-modal modal" role="alertdialog" aria-modal="true">
            <Trash2 size={28} />
            <h2>Remove this little piece?</h2>
            <p>It will be removed from your storefront. Existing order history will be kept.</p>
            <div className="edit-actions">
              <button className="outline" onClick={() => setDeleteId("")}>
                Keep product
              </button>
              <button className="primary danger" disabled={busy} onClick={remove}>
                Remove product
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}
