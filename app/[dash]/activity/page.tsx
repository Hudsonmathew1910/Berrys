import { listActivity } from "@/lib/admin/team";
import { adminHref, requirePage } from "@/lib/staff";
import { pageNum } from "@/components/dashboard/list-tools";
import { Pagination } from "@/components/shop/pagination";

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requirePage("admin");
  const page = pageNum((await searchParams).page);
  const res = await listActivity(page);
  return (
    <div className="dash-page">
      <div className="dash-heading">
        <h1>Activity log</h1>
        <span className="muted">{res.total} entries</span>
      </div>
      <div className="table-scroll">
        <table className="dash-table compact">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
              <th>Item</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {res.rows.map((a) => (
              <tr key={a.id}>
                <td>{a.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                <td>{a.actor}</td>
                <td>{a.action}</td>
                <td>{a.target}</td>
                <td className="muted">{a.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!res.rows.length && <p className="dash-empty">No activity yet.</p>}
      </div>
      <Pagination page={page} pages={res.pages} basePath={adminHref("activity")} params={{}} />
    </div>
  );
}
