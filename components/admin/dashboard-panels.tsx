"use client";
import { useState } from "react";
import { AlertCircle, ArrowRight, Boxes, ChevronDown, Package, ShoppingBag } from "lucide-react";
import { money, sizes, type Product } from "@/lib/catalog";
import { CategoryChart } from "./category-chart";
import { salesStatuses, type Overview } from "./types";

export function StatsAndCharts({
  products,
  overview,
  onEdit,
  onManageInventory,
}: {
  products: Product[];
  overview: Overview;
  onEdit: (p: Product) => void;
  onManageInventory: () => void;
}) {
  const [top, setTop] = useState(5);
  const sold = overview.orders.filter((o) => salesStatuses.includes(o.status));
  const stockUnits = products.reduce((a, p) => a + Object.values(p.stock).reduce((b, n) => b + n, 0), 0);
  const lowSizes = products.reduce(
    (a, p) => a + Object.values(p.stock).filter((n) => n > 0 && n <= 3).length,
    0,
  );
  const needsAttention = overview.orders.filter(
    (o) => o.status === "paid" || o.status === "needs_refund",
  ).length;

  const stats = [
    ["Sales", money(sold.reduce((a, o) => a + o.total, 0)), "Paid orders, last 100", ShoppingBag],
    ["Orders to fulfil", needsAttention, "Paid and waiting, or needing a refund", Package],
    ["Pieces in stock", stockUnits, "Across all active product sizes", Boxes],
    ["Low-stock sizes", lowSizes, "Size variants with 3 or fewer left", AlertCircle],
  ] as const;

  return (
    <>
      <div className="stats-grid">
        {stats.map(([label, value, note, Icon]) => (
          <div className="stat-card" key={label}>
            <div>
              {label}
              <Icon size={17} />
            </div>
            <strong>{value}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="admin-panel">
          <div className="panel-heading">
            <div>
              <h3>Little bestsellers</h3>
              <p>Product categories · units sold · paid orders</p>
            </div>
            <select
              aria-label="Number of top categories"
              value={top}
              onChange={(e) => setTop(Number(e.target.value))}
            >
              <option value={5}>Top 5</option>
              <option value={10}>Top 10</option>
            </select>
          </div>
          <CategoryChart ranking={overview.ranking} top={top} />
          <div className="chart-caption">
            {overview.ranking.length
              ? `${Math.min(top, overview.ranking.length)} categories with recorded sales. `
              : ""}
            Updates automatically after each paid order.
          </div>
        </section>
        <section className="admin-panel">
          <div className="panel-heading">
            <div>
              <h3>A little stock check</h3>
              <p>Keep their favourites available.</p>
            </div>
            <Boxes size={20} />
          </div>
          <div className="stock-check">
            {products
              .filter((p) => Object.values(p.stock).some((n) => n <= 3))
              .slice(0, 5)
              .map((p) => (
                <button key={p.id} onClick={() => onEdit(p)}>
                  <img src={p.image} alt="" />
                  <div>
                    <b>{p.name}</b>
                    <small>
                      {sizes
                        .filter((s) => p.stock[s] <= 3)
                        .map((s) => `${s}: ${p.stock[s] === 0 ? "sold out" : p.stock[s] + " left"}`)
                        .join(" · ")}
                    </small>
                  </div>
                  <ChevronDown className="rotate" size={16} />
                </button>
              ))}
          </div>
          <button className="panel-link" onClick={onManageInventory}>
            Manage inventory <ArrowRight size={16} />
          </button>
        </section>
      </div>
    </>
  );
}
