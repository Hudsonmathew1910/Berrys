import { money } from "@/lib/catalog";

/** Vertical bars per day (server-rendered, no JS). */
export function DayBars({ data }: { data: { day: string; revenue: number; orders: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.revenue));
  return (
    <div className="day-bars" role="img" aria-label="Revenue per day">
      {data.map((d) => (
        <div key={d.day} className="day-bar" title={`${d.day}: ${money(d.revenue)} · ${d.orders} orders`}>
          <span style={{ height: `${Math.max(2, (d.revenue / max) * 100)}%` }} />
          <small>{d.day.slice(8)}</small>
        </div>
      ))}
    </div>
  );
}

/** Horizontal ranked bars. */
export function RankBars({ rows }: { rows: { label: string; value: number; display: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="muted">No sales in this period yet.</p>;
  return (
    <div className="rank-bars">
      {rows.map((r) => (
        <div key={r.label} className="rank-bar">
          <div>
            <span>{r.label}</span>
            <b>{r.display}</b>
          </div>
          <div className="track">
            <div style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Stat({
  label,
  value,
  note,
  delta,
}: {
  label: string;
  value: string | number;
  note?: string;
  delta?: number;
}) {
  return (
    <div className="dash-stat">
      <small>{label}</small>
      <strong>{value}</strong>
      {delta !== undefined && Number.isFinite(delta) && (
        <em className={delta >= 0 ? "up" : "down"}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(Math.round(delta))}% vs previous
        </em>
      )}
      {note && <span>{note}</span>}
    </div>
  );
}

export const pctChange = (cur: number, prev: number) => (prev ? ((cur - prev) / prev) * 100 : cur ? 100 : 0);
