import Link from "next/link";
import { listMovements, lowStock, productOptions } from "@/lib/admin/catalog";
import { getCategories } from "@/lib/categories";
import { adminHref, requirePage } from "@/lib/staff";
import { ActionForm } from "@/components/dashboard/action-form";
import { pageNum } from "@/components/dashboard/list-tools";
import { Pagination } from "@/components/shop/pagination";
import { adjustStockAction } from "../actions";

type SP = { product?: string; page?: string };

export default async function StockPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePage("stock");
  const sp = await searchParams;
  const page = pageNum(sp.page);
  const productId = sp.product?.slice(0, 100) || undefined;
  const [low, moves, products, cats] = await Promise.all([
    lowStock(3, 30),
    listMovements({ productId, page }),
    productOptions(),
    getCategories(false),
  ]);
  const allSizes = [...new Set(cats.flatMap((c) => c.sizes))];

  return (
    <div className="dash-page">
      <div className="dash-heading">
        <h1>Stock</h1>
      </div>
      <div className="dash-grid">
        <section className="dash-panel">
          <h2>Low stock (3 or fewer)</h2>
          <ul className="dash-list">
            {low.map((l) => (
              <li key={l.productId + l.size}>
                <img src={l.image} alt="" />
                <span>
                  <Link href={adminHref(`products/${encodeURIComponent(l.productId)}`)}>{l.name}</Link>
                  <small>
                    {l.category} · Size {l.size}
                  </small>
                </span>
                <b className={l.quantity ? "warn" : "danger"}>
                  {l.quantity ? `${l.quantity} left` : "Sold out"}
                </b>
              </li>
            ))}
          </ul>
          {!low.length && <p className="muted">Everything is well stocked.</p>}
        </section>

        <section className="dash-panel">
          <h2>Add or remove stock</h2>
          <ActionForm action={adjustStockAction} resetOnSuccess>
            <label>
              Product
              <select name="productId" required defaultValue={productId ?? ""}>
                <option value="" disabled>
                  Choose…
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.category})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Size
              <select name="size" required>
                {allSizes.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Change (e.g. 10 to add, -2 to remove)
              <input name="change" type="number" required />
            </label>
            <label>
              Note
              <input name="note" maxLength={200} placeholder="New delivery from supplier" />
            </label>
            <button className="primary">Update stock</button>
          </ActionForm>
        </section>

        <section className="dash-panel wide">
          <h2>
            Stock history{" "}
            {productId && (
              <Link className="text-link" href={adminHref("stock")}>
                (show all products)
              </Link>
            )}
          </h2>
          <div className="table-scroll">
            <table className="dash-table compact">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Product</th>
                  <th>Size</th>
                  <th>Change</th>
                  <th>Reason</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {moves.rows.map(({ m, name }) => (
                  <tr key={m.id}>
                    <td>
                      {m.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td>
                      <Link href={adminHref(`stock?product=${encodeURIComponent(m.productId)}`)}>
                        {name ?? m.productId}
                      </Link>
                    </td>
                    <td>{m.size}</td>
                    <td className={m.change > 0 ? "plus" : "minus"}>
                      {m.change > 0 ? "+" : ""}
                      {m.change}
                    </td>
                    <td>
                      {m.reason}
                      {m.orderId && (
                        <>
                          {" · "}
                          <Link href={adminHref(`orders/${m.orderId}`)}>{m.orderId}</Link>
                        </>
                      )}
                      {m.note && <small className="block">{m.note}</small>}
                    </td>
                    <td className="muted">{m.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!moves.rows.length && <p className="muted">No stock changes yet.</p>}
          <Pagination
            page={page}
            pages={moves.pages}
            basePath={adminHref("stock")}
            params={{ product: productId }}
          />
        </section>
      </div>
    </div>
  );
}
