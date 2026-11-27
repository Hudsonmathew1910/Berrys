import Link from "next/link";
import { listOrders } from "@/lib/admin/orders";
import { listAdminProducts, listCategoriesWithCounts, listOffers } from "@/lib/admin/catalog";
import { listCustomers } from "@/lib/admin/insights";
import { money } from "@/lib/catalog";
import { statusLabels } from "@/lib/order-status";
import { adminHref, can, requirePage } from "@/lib/staff";
import type { AccessKey } from "@/db/schema";

/** Dashboard pages (and settings sections) you can find by name, e.g. "emails" or "seo". */
const pages: { label: string; href: string; access: AccessKey | null; words?: string }[] = [
  { label: "Overview", href: "", access: null, words: "home dashboard" },
  { label: "Orders", href: "orders", access: "orders", words: "shipping packing" },
  { label: "Products", href: "products", access: "products", words: "catalogue items" },
  { label: "Categories", href: "categories", access: "categories", words: "sizes" },
  { label: "Offers", href: "offers", access: "offers", words: "discounts sale prices" },
  { label: "Stock", href: "stock", access: "stock", words: "inventory restock" },
  { label: "Payments", href: "payments", access: "payments", words: "razorpay" },
  { label: "Customers", href: "customers", access: "customers", words: "users accounts" },
  { label: "Sales & analytics", href: "analytics", access: "analytics", words: "reports revenue" },
  { label: "Website content", href: "content", access: "content", words: "banners home footer help pages" },
  { label: "Requests", href: "requests", access: "requests", words: "approvals refunds" },
  { label: "Team & access", href: "team", access: "team", words: "staff admins permissions" },
  { label: "Activity log", href: "activity", access: "activity", words: "history audit" },
  { label: "Error log", href: "errors", access: "errors", words: "problems" },
  { label: "My account", href: "account", access: null, words: "password" },
  {
    label: "Settings → Store details",
    href: "settings#store",
    access: "settings",
    words: "name logo address phone",
  },
  { label: "Settings → Payments", href: "settings#payments", access: "settings", words: "razorpay demo" },
  {
    label: "Settings → Shipping & returns",
    href: "settings#shipping",
    access: "settings",
    words: "delivery refund window",
  },
  {
    label: "Settings → Emails",
    href: "settings#emails",
    access: "settings",
    words: "resend smtp gmail sender mail",
  },
  {
    label: "Settings → Emails sent",
    href: "settings#email-usage",
    access: "settings",
    words: "limit mail count",
  },
  {
    label: "Settings → Maintenance mode",
    href: "settings#maintenance",
    access: "settings",
    words: "close shop",
  },
  {
    label: "Settings → Social media",
    href: "settings#social",
    access: "settings",
    words: "instagram facebook youtube",
  },
  { label: "Settings → SEO", href: "settings#seo", access: "settings", words: "google title description" },
];

const LIMIT = 5;

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const staff = await requirePage();
  const q = (await searchParams).q?.trim().slice(0, 80) ?? "";
  const term = q.toLowerCase();
  const allowed = (k: AccessKey | null) => !k || can(staff, k);

  const [orders, products, customers, categories, offers] = q
    ? await Promise.all([
        can(staff, "orders") ? listOrders({ q, page: 1 }) : null,
        can(staff, "products") ? listAdminProducts({ q, page: 1, perPage: LIMIT }) : null,
        can(staff, "customers") ? listCustomers({ q, page: 1 }) : null,
        can(staff, "categories") ? listCategoriesWithCounts() : null,
        can(staff, "offers") ? listOffers() : null,
      ])
    : [null, null, null, null, null];
  const pageHits = q
    ? pages.filter((p) => allowed(p.access) && `${p.label} ${p.words ?? ""}`.toLowerCase().includes(term))
    : [];
  const catHits = categories?.filter((c) => c.name.toLowerCase().includes(term)) ?? [];
  const offerHits = offers?.filter((o) => o.name.toLowerCase().includes(term)) ?? [];
  const found =
    pageHits.length +
    (orders?.total ?? 0) +
    (products?.total ?? 0) +
    (customers?.total ?? 0) +
    catHits.length +
    offerHits.length;
  const more = (n: number, shown: number, href: string) =>
    n > shown && (
      <Link className="text-link" href={href}>
        See all {n}
      </Link>
    );

  return (
    <div className="dash-page">
      <div className="dash-heading">
        <h1>Search</h1>
        {q && (
          <span className="muted">{found ? `${found} results for “${q}”` : `Nothing found for “${q}”`}</span>
        )}
      </div>
      <form className="dash-search wide" action={adminHref("search")} role="search">
        <input name="q" defaultValue={q} placeholder="Order number, customer, product, page…" autoFocus />
        <button className="primary">Search</button>
      </form>

      <div className="search-results">
        {pageHits.length > 0 && (
          <section className="dash-panel">
            <h2>Pages</h2>
            <ul className="search-list">
              {pageHits.map((p) => (
                <li key={p.href}>
                  <Link href={adminHref(p.href)}>{p.label}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {orders && orders.total > 0 && (
          <section className="dash-panel">
            <h2>
              Orders <small className="muted">· {orders.total}</small>
            </h2>
            <ul className="search-list">
              {orders.rows.slice(0, LIMIT).map((o) => (
                <li key={o.id}>
                  <Link href={adminHref(`orders/${encodeURIComponent(o.id)}`)}>{o.id}</Link>
                  <span className="muted">
                    {o.customer} · {money(o.total)} · {statusLabels[o.status]}
                  </span>
                </li>
              ))}
            </ul>
            {more(orders.total, LIMIT, `${adminHref("orders")}?q=${encodeURIComponent(q)}`)}
          </section>
        )}
        {products && products.total > 0 && (
          <section className="dash-panel">
            <h2>
              Products <small className="muted">· {products.total}</small>
            </h2>
            <ul className="search-list">
              {products.rows.slice(0, LIMIT).map((p) => (
                <li key={p.id}>
                  <Link href={adminHref(`products/${encodeURIComponent(p.id)}`)}>{p.name}</Link>
                  <span className="muted">
                    {p.category} · {money(p.price)}
                    {!p.active && " · hidden"}
                  </span>
                </li>
              ))}
            </ul>
            {more(products.total, LIMIT, `${adminHref("products")}?q=${encodeURIComponent(q)}`)}
          </section>
        )}
        {customers && customers.total > 0 && (
          <section className="dash-panel">
            <h2>
              Customers <small className="muted">· {customers.total}</small>
            </h2>
            <ul className="search-list">
              {customers.rows.slice(0, LIMIT).map(({ user, orders: n }) => (
                <li key={user.id}>
                  <Link
                    href={`${adminHref("customers")}?q=${encodeURIComponent(user.email ?? user.phone ?? user.name ?? "")}`}
                  >
                    {user.name || user.email || user.phone}
                  </Link>
                  <span className="muted">
                    {user.email ?? user.phone} · {n} {n === 1 ? "order" : "orders"}
                  </span>
                </li>
              ))}
            </ul>
            {more(customers.total, LIMIT, `${adminHref("customers")}?q=${encodeURIComponent(q)}`)}
          </section>
        )}
        {catHits.length > 0 && (
          <section className="dash-panel">
            <h2>Categories</h2>
            <ul className="search-list">
              {catHits.slice(0, LIMIT).map((c) => (
                <li key={c.id}>
                  <Link href={`${adminHref("categories")}#cat-${c.id}`}>{c.name}</Link>
                  <span className="muted">
                    {c.products} products{!c.active && " · hidden"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {offerHits.length > 0 && (
          <section className="dash-panel">
            <h2>Offers</h2>
            <ul className="search-list">
              {offerHits.slice(0, LIMIT).map((o) => (
                <li key={o.id}>
                  <Link href={`${adminHref("offers")}#offers`}>{o.name}</Link>
                  <span className="muted">{o.active ? "on" : "off"}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {!q && (
        <p className="muted">
          Type an order number, a customer’s name, email or phone, a product, or a page.
        </p>
      )}
    </div>
  );
}
