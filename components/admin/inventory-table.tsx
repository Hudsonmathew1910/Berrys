"use client";
import { useState } from "react";
import { Pencil, Search, Trash2 } from "lucide-react";
import { isSoldOut, money, sizes, type Product } from "@/lib/catalog";
import { IconButton } from "@/components/store/modal";

export function InventoryTable({
  products,
  onEdit,
  onDelete,
}: {
  products: Product[];
  onEdit: (p: Product) => void;
  onDelete: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const rows = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <section className="admin-panel inventory-panel">
      <div className="inventory-tools">
        <div className="admin-search">
          <Search size={17} />
          <input
            placeholder="Search your products…"
            aria-label="Search admin products"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span>{products.length} active products</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>PRODUCT</th>
              <th>PRICE</th>
              {sizes.map((s) => (
                <th key={s}>{s}</th>
              ))}
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="table-product">
                    <img src={p.image} alt="" />
                    <div>
                      <b>{p.name}</b>
                      <small>{p.category}</small>
                    </div>
                  </div>
                </td>
                <td>{money(p.price)}</td>
                {sizes.map((s) => (
                  <td key={s}>
                    <span className={"stock-num " + (!p.stock[s] ? "zero" : p.stock[s] <= 3 ? "low" : "")}>
                      {p.stock[s]}
                    </span>
                  </td>
                ))}
                <td>
                  <span className={"status-pill " + (isSoldOut(p) ? "out" : "")}>
                    {isSoldOut(p) ? "Sold out" : "Active"}
                  </span>
                </td>
                <td>
                  <div className="row-actions">
                    <IconButton label={"Edit " + p.name} onClick={() => onEdit(p)}>
                      <Pencil size={16} />
                    </IconButton>
                    <IconButton label={"Remove " + p.name} onClick={() => onDelete(p.id)}>
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-note">
        Stock is tracked per size. A size with 0 pieces appears as sold out in the storefront. Stock is held
        for 30 minutes while a customer pays.
      </div>
    </section>
  );
}
