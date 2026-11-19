import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { getAdminProduct, listMovements } from "@/lib/admin/catalog";
import { getCategories } from "@/lib/categories";
import { adminHref, can, requirePage } from "@/lib/staff";
import { ActionForm } from "@/components/dashboard/action-form";
import { ProductEditor } from "@/components/dashboard/product-editor";
import { deleteProductAction, productVisibilityAction } from "../../actions";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePage("products");
  const id = decodeURIComponent((await params).id);
  const [p, cats, moves] = await Promise.all([
    getAdminProduct(id),
    getCategories(false),
    listMovements({ productId: id, page: 1 }),
  ]);
  if (!p) notFound();
  const canDelete = can(staff, "delete_products");

  return (
    <div className="dash-page">
      <Link className="text-link" href={adminHref("products")}>
        <ArrowLeft size={15} /> All products
      </Link>
      <div className="dash-heading">
        <div>
          <h1>{p.name}</h1>
          <span className="muted">{p.id}</span>
        </div>
        {p.active && (
          <Link className="outline" href={`/products/${encodeURIComponent(p.id)}`} target="_blank">
            View in shop <ArrowUpRight size={14} />
          </Link>
        )}
      </div>

      <ProductEditor
        listHref={adminHref("products")}
        categories={cats.map((c) => ({ name: c.name, sizes: c.sizes }))}
        initial={{
          id: p.id,
          name: p.name,
          category: p.category,
          gender: p.gender,
          tags: p.tags,
          price: p.basePrice,
          originalPrice: p.originalPrice,
          description: p.description,
          images: p.images.filter(Boolean),
          badge: p.badge,
          color: p.color,
          active: p.active,
          stock: p.stock,
        }}
      />

      <div className="dash-grid">
        <section className="dash-panel">
          <h2>{p.active ? "Hide from the shop" : "Show in the shop"}</h2>
          <p className="muted">
            Hidden products stay in your records and past orders but customers can’t see them.
          </p>
          <ActionForm action={productVisibilityAction}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="active" value={String(!p.active)} />
            <button className="outline">{p.active ? "Hide product" : "Show product"}</button>
          </ActionForm>
        </section>
        <section className="dash-panel">
          <h2>{canDelete ? "Delete product" : "Request deletion"}</h2>
          <p className="muted">
            {canDelete
              ? "Permanently removes the product and its stock. Past orders keep their details."
              : "An admin will review your request. You can hide the product meanwhile."}
          </p>
          <ActionForm
            action={deleteProductAction}
            confirm={canDelete ? `Permanently delete “${p.name}”?` : undefined}
          >
            <input type="hidden" name="id" value={p.id} />
            <label>
              Reason{canDelete ? " (optional)" : ""}
              <input name="reason" maxLength={500} required={!canDelete} />
            </label>
            <button className={canDelete ? "primary danger" : "outline"}>
              {canDelete ? "Delete permanently" : "Send delete request"}
            </button>
          </ActionForm>
        </section>
        <section className="dash-panel wide">
          <h2>Stock history</h2>
          <table className="dash-table compact">
            <tbody>
              {moves.rows.slice(0, 10).map(({ m }) => (
                <tr key={m.id}>
                  <td>{m.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td>Size {m.size}</td>
                  <td className={m.change > 0 ? "plus" : "minus"}>
                    {m.change > 0 ? "+" : ""}
                    {m.change}
                  </td>
                  <td>
                    {m.reason}
                    {m.orderId && ` · ${m.orderId}`}
                  </td>
                  <td className="muted">{m.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!moves.rows.length && <p className="muted">No stock changes recorded yet.</p>}
          {moves.total > 10 && (
            <Link className="text-link" href={adminHref(`stock?product=${encodeURIComponent(p.id)}`)}>
              See all {moves.total} changes
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}
