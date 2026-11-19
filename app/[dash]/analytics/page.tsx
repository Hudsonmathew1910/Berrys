import Link from "next/link";
import {
  salesByCategory,
  salesByDay,
  salesBySize,
  salesSummary,
  topProducts,
  trendingProducts,
} from "@/lib/admin/insights";
import { money } from "@/lib/catalog";
import { adminHref, requirePage } from "@/lib/staff";
import { DayBars, pctChange, RankBars, Stat } from "@/components/dashboard/charts";

const ranges = [7, 30, 90, 365] as const;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requirePage("analytics");
  const asked = Number((await searchParams).days);
  const days = (ranges as readonly number[]).includes(asked) ? asked : 30;
  const [summary, byDay, top, trending, byCat, bySize] = await Promise.all([
    salesSummary(days),
    salesByDay(Math.min(days, 90)),
    topProducts(days, 10),
    trendingProducts(10),
    salesByCategory(days),
    salesBySize(days),
  ]);

  return (
    <div className="dash-page">
      <div className="dash-heading">
        <h1>Sales & analytics</h1>
        <nav className="range-tabs" aria-label="Period">
          {ranges.map((r) => (
            <Link key={r} href={adminHref(`analytics?days=${r}`)} className={r === days ? "active" : ""}>
              {r === 365 ? "1 year" : `${r} days`}
            </Link>
          ))}
        </nav>
      </div>
      <div className="dash-stats">
        <Stat
          label="Revenue"
          value={money(summary.revenue)}
          delta={pctChange(summary.revenue, summary.prev.revenue)}
        />
        <Stat label="Orders" value={summary.orders} delta={pctChange(summary.orders, summary.prev.orders)} />
        <Stat label="Average order value" value={money(summary.aov)} />
        <Stat label="Pieces sold" value={summary.units} />
        <Stat
          label="Customers"
          value={summary.customers}
          delta={pctChange(summary.customers, summary.prev.customers)}
        />
      </div>
      <div className="dash-grid">
        <section className="dash-panel wide">
          <h2>Revenue per day{days > 90 ? " (last 90 days)" : ""}</h2>
          <DayBars data={byDay} />
        </section>
        <section className="dash-panel">
          <h2>Best sellers</h2>
          <RankBars
            rows={top.map((t) => ({
              label: t.name,
              value: t.units,
              display: `${t.units} · ${money(t.revenue)}`,
            }))}
          />
        </section>
        <section className="dash-panel">
          <h2>Trending (this week vs last)</h2>
          <RankBars
            rows={trending.map((t) => ({
              label: t.name,
              value: t.recent,
              display: `${t.recent} sold${t.before ? ` (was ${t.before})` : " (new)"}`,
            }))}
          />
        </section>
        <section className="dash-panel">
          <h2>By category</h2>
          <RankBars
            rows={byCat.map((c) => ({
              label: c.category,
              value: c.revenue,
              display: `${money(c.revenue)} · ${c.units} pcs`,
            }))}
          />
        </section>
        <section className="dash-panel">
          <h2>Sizes that sell</h2>
          <RankBars
            rows={bySize.map((s) => ({ label: s.size, value: s.units, display: `${s.units} pcs` }))}
          />
        </section>
      </div>
    </div>
  );
}
