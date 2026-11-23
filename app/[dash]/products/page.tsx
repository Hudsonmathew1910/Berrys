import Link from "next/link";
import { Plus } from "lucide-react";
import { listAdminProducts } from "@/lib/admin/catalog";
import { getCategories } from "@/lib/categories";
import { money } from "@/lib/catalog";
import { adminHref, can, requirePage } from "@/lib/staff";
import { BulkAll, BulkBar, BulkCheck } from "@/components/dashboard/bulk-bar";
import { bulkProductsAction } from "../actions";
import { ListTools, pageNum } from "@/components/dashboard/list-tools";
import { Pagination } from "@/components/shop/pagination";

type SP = { q?: string; category?: string; status?: string; page?: string };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const staff = await requirePage("products");
  const canDelete = can(staff, "delete_products");
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 80) || undefined;
  const page = pageNum(sp.page);
  const cats = await getCategories(false);
  const category = cats.some((c) => c.name === sp.category) ? sp.category : undefined;
  const status = ["active", "hidden", "out"].includes(sp.status ?? "") ? sp.status : undefined;
  const res = await listAdminProducts({ q, category, status, page });
  const hiddenCats = new Set(cats.filter((c) => !c.active).map((c) => c.name));

  return (
    <div className="dash-page">
      <div className="dash-heading">
        <div>
          <h1>Products</h1>
          <span className="muted">{res.total} products</span>
        </div>
        <Link className="primary" href={adminHref("products/new")}>
          <Plus size={16} /> Add products
        </Link>
      </div>
      <ListTools
        q={q}
        placeholder="Search name, id or tag"
        selects={[
          {
            name: "category",
            label: "Category",
            value: category,
            options: [["", "All categories"], ...cats.map((c) => [c.name, c.name] as [string, string])],
          },
          {
            name: "status",
            label: "Status",
            value: status,
            options: [
              ["", "Any status"],
              ["active", "Visible"],
              ["hidden", "Hidden"],
              ["out", "Out of stock"],
            ],
          },
        ]}
      />
      <BulkBar
        id="products-bulk"
        action={bulkProductsAction}
        noun="product"
        ops={[
          { op: "show", label: "Show in shop" },
          { op: "hide", label: "Hide" },
          {
            op: "delete",
            label: canDelete ? "Delete" : "Request deletion",
            danger: true,
            confirm: canDelete
              ? "Delete {n} products permanently? Past orders keep their own copy."
              : "Ask an admin to delete {n} products?",
          },
        ]}
        fields={canDelete ? [] : [{ name: "reason", label: "Reason (for delete requests)" }]}
      />
      <div className="table-scroll">
        <table className="dash-table">
          <thead>
            <tr>
              <th className="bulk-col">
                <BulkAll form="products-bulk" />
              </th>
              <th>Product</th>
              <th>Price</th>
              <th>Stock by size</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {res.rows.map((p) => (
              <tr key={p.id}>
                <td className="bulk-col">
                  <BulkCheck form="products-bulk" value={p.id} label={`Select ${p.name}`} />
                </td>
                <td>
                  <Link className="table-product" href={adminHref(`products/${encodeURIComponent(p.id)}`)}>
                    <img src={p.image} alt="" />
                    <span>
                      <b>{p.name}</b>
                      <small className="block">
                        {p.category} · {p.gender}
                      </small>
                    </span>
                  </Link>
                </td>
                <td>
                  {money(p.price)}
                  {p.offer && (
                    <small className="block">
                      {p.offer} · MRP {money(p.basePrice)}
                    </small>
                  )}
                </td>
                <td>
                  <span className="size-stock">
                    {p.sizes.map((s) => (
                      <span key={s} className={!p.stock[s] ? "zero" : p.stock[s] <= 3 ? "low" : ""}>
                        {s}: {p.stock[s]}
                      </span>
                    ))}
                  </span>
                </td>
                <td>
                  {p.active && hiddenCats.has(p.category) ? (
                    <span
                      className="status-pill out"
                      title="Its category is hidden, so customers can’t see it"
                    >
                      Hidden (category hidden)
                    </span>
                  ) : (
                    <span className={"status-pill " + (p.active ? "" : "out")}>
                      {p.active ? "Visible" : "Hidden"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!res.rows.length && <p className="dash-empty">No products match.</p>}
      </div>
      <Pagination
        page={page}
        pages={res.pages}
        basePath={adminHref("products")}
        params={{ q, category, status }}
      />
    </div>
  );
}
