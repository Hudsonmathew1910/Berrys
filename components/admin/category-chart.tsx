"use client";
import { BarChart3 } from "lucide-react";
import type { CategoryRank } from "./types";

/** Categories ranked by units sold (paid orders only). */
export function CategoryChart({ ranking, top }: { ranking: CategoryRank[]; top: number }) {
  const data = ranking.slice(0, top);
  const max = Math.max(1, ...data.map((r) => r.units));
  return (
    <div className="chart">
      {data.length ? (
        data.map((r, i) => (
          <div className="bar-row" key={r.category}>
            <span className="rank">{String(i + 1).padStart(2, "0")}</span>
            <div>
              <div className="bar-label">
                <span>{r.category}</span>
                <b>{r.units} units</b>
              </div>
              <div className="track">
                <div style={{ width: Math.max(4, (r.units / max) * 100) + "%" }} />
              </div>
            </div>
          </div>
        ))
      ) : (
        <div className="chart-empty">
          <BarChart3 size={36} />
          <h3>Your bestsellers start here.</h3>
          <p>Once paid orders come in, this chart ranks categories by units sold.</p>
        </div>
      )}
    </div>
  );
}
