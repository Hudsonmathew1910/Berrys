import Link from "next/link";
import { listMovements, lowStock, productOptions, stockSummary } from "@/lib/admin/catalog";
import { getCategories } from "@/lib/categories";
import { adminHref, requirePage } from "@/lib/staff";
import { Stat } from "@/components/dashboard/charts";
import { BulkAll, BulkBar, BulkCheck } from "@/components/dashboard/bulk-bar";
import { RowsEditor } from "@/components/dashboard/rows-editor";
import { pageNum } from "@/components/dashboard/list-tools";
import { Pagination } from "@/components/shop/pagination";
import { addStockRowsAction, bulkStockAction } from "../actions";

type SP = { product?: string; page?: string };

const LOW = 3;

export default async function StockPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePage("stock");
  const sp = await searchParams;
  const page = pageNum(sp.page);
  const productId = sp.product?.slice(0, 100) || undefined;
  const [low, moves, products, cats, sum] = await Promise.all([
    lowStock(LOW, 60),
    listMovements({ productId, page }),
    productOptions(),
    getCategories(false),
    stockSummary(LOW),
  ]);
  const catSizes = new Map(cats.map((c) => [c.name, c.sizes] as const));
  const sizesFor = Object.fromEntries(
    products.map((p) => [p.id, (catSizes.get(p.category) ?? []).map((s) => [s, s] as [string, string])]),
  );
  const filtered = productId ? products.find((p) => p.id === productId) : undefined;

  return (
    <div className="dash-page stock-page">
      <div className="dash-heading">
        <div>
          <h1>Stock</h1>
          <span className="muted">
            Counts for products that are visible in the shop. Sales take stock automatically; use this page
            for deliveries, corrections and restocking.
          </span>
        </div>
      </div>

      <div className="dash-stats">
        <Stat
          label="Units in stock"
          value={sum.units.toLocaleString("en-IN")}
          note={`${sum.products} products`}
        />
        <Stat label="Sizes sold out" value={sum.soldOut} />
        <Stat label={`Sizes running low (1–${LOW})`} value={sum.low} />
      </div>

      <section className="dash-panel">
        <h2>Add or remove stock</h2>
        <p className="muted">
          One row per product and size — e.g. <b>10</b> to add a delivery, <b>-2</b> to remove damaged pieces.
          Add as many rows as you need, then save.
        </p>
        <RowsEditor
          action={addStockRowsAction}
          addLabel="Add another row"
          saveLabel="Save stock changes"
          defaults={{ productId: productId ?? "", size: "", change: "", note: "" }}
          columns={[
            {
              key: "productId",
              label: "Product",
              type: "select",
              required: true,
              options: products.map((p) => [p.id, `${p.name} (${p.category})`] as [string, string]),
            },
            {
              key: "size",
              label: "Size",
              type: "select",
              required: true,
              width: "110px",
              optionsBy: { key: "productId", map: sizesFor },
            },
            { key: "change", label: "Change", type: "number", required: true, width: "100px" },
            { key: "note", label: "Note", type: "text", maxLength: 200, placeholder: "New delivery" },
          ]}
        />
      </section>

      <section className="dash-panel">
        <h2>
          Needs restocking <small className="muted">· sold out or {LOW} or fewer left</small>
        </h2>
        <BulkBar
          id="stock-bulk"
          action={bulkStockAction}
          noun="size"
          ops={[
            { op: "add", label: "Add to each" },
            { op: "soldout", label: "Mark sold out", danger: true, confirm: "Set {n} sizes to 0?" },
          ]}
          fields={[{ name: "amount", label: "How many (e.g. 10)", type: "number" }]}
        />
        {low.length ? (
          <>
            <div className="table-scroll restock-scroll">
              <table className="dash-table compact">
                <thead>
                  <tr>
                    <th className="bulk-col">
                      <BulkAll form="stock-bulk" />
                    </th>
                    <th>Product</th>
                    <th>Size</th>
                    <th>Left</th>
                  </tr>
                </thead>
                <tbody>
                  {low.map((l) => (
                    <tr key={l.productId + l.size}>
                      <td className="bulk-col">
                        <BulkCheck
                          form="stock-bulk"
                          value={`${l.productId}|${l.size}`}
                          label={`Select ${l.name} size ${l.size}`}
                        />
                      </td>
                      <td>
                        <Link
                          className="table-product small"
                          href={adminHref(`stock?product=${encodeURIComponent(l.productId)}`)}
                          title="Show this product’s stock history"
                        >
                          <img src={l.image} alt="" />
                          <span>
                            <b>{l.name}</b>
                            <small className="block muted">{l.category}</small>
                          </span>
                        </Link>
                      </td>
                      <td>{l.size}</td>
                      <td>
                        <span className={"status-pill " + (l.quantity ? "low-pill" : "out")}>
                          {l.quantity ? `${l.quantity} left` : "Sold out"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="muted">Everything is well stocked. 🎉</p>
        )}
      </section>

      <section className="dash-panel">
        <h2>
          Stock history
          {filtered && (
            <>
              {" "}
              <small className="muted">· {filtered.name}</small>{" "}
              <Link className="text-link" href={adminHref("stock")}>
                Show all products
              </Link>
            </>
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
                  <td>{m.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
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
  );
}
