import Link from "next/link";
import { errorSources, type ErrorSource } from "@/db/schema";
import { ERROR_PAGE_SIZE, listErrors } from "@/lib/error-log";
import { getSettings } from "@/lib/settings";
import { adminHref, requirePage } from "@/lib/staff";
import { ActionForm } from "@/components/dashboard/action-form";
import { pageNum } from "@/components/dashboard/list-tools";
import { Pagination } from "@/components/shop/pagination";
import { clearErrorsAction } from "../actions";

const sourceLabels: Record<ErrorSource, string> = {
  server: "Website",
  payment: "Payments",
  email: "Emails",
  auth: "Login",
  dashboard: "Dashboard",
  browser: "Browser",
};

const ist = (d: Date) =>
  d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "medium" });

/** Errors on the website, payments and emails. Admins only. */
export default async function ErrorLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; source?: string }>;
}) {
  await requirePage("admin");
  const sp = await searchParams;
  const source = (errorSources as readonly string[]).includes(sp.source ?? "")
    ? (sp.source as ErrorSource)
    : undefined;
  const page = pageNum(sp.page);
  const [errors, settings] = await Promise.all([listErrors({ source, page }), getSettings()]);
  const pages = Math.max(1, Math.ceil(errors.total / ERROR_PAGE_SIZE));
  const base = adminHref("errors");

  return (
    <div className="dash-page">
      <div className="dash-heading">
        <div>
          <h1>Error log</h1>
          <span className="muted">
            {errors.total} recorded · kept for {settings.errorLogDays} days (
            <Link href={adminHref("settings#logs")}>change</Link>)
          </span>
        </div>
      </div>

      <nav className="range-tabs error-tabs" aria-label="Filter errors">
        <Link href={base} className={!source ? "active" : ""}>
          All
        </Link>
        {errorSources.map((k) => (
          <Link key={k} href={`${base}?source=${k}`} className={source === k ? "active" : ""}>
            {sourceLabels[k]}
          </Link>
        ))}
      </nav>

      <section className="dash-panel error-log">
        {errors.rows.length ? (
          <div className="table-scroll">
            <table className="dash-table compact">
              <thead>
                <tr>
                  <th>When (IST)</th>
                  <th>Area</th>
                  <th>What happened</th>
                  <th>Where</th>
                </tr>
              </thead>
              <tbody>
                {errors.rows.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap">{ist(e.createdAt)}</td>
                    <td>
                      <span className={`status-pill err-${e.source}`}>
                        {sourceLabels[e.source] ?? e.source}
                      </span>
                    </td>
                    <td className="error-msg">
                      {e.detail ? (
                        <details>
                          <summary>{e.message}</summary>
                          <pre>{e.detail}</pre>
                        </details>
                      ) : (
                        e.message
                      )}
                    </td>
                    <td className="muted">
                      {e.path}
                      {e.ref && <div>{e.ref}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="dash-empty">No errors{source ? ` in ${sourceLabels[source]}` : ""}. All good.</p>
        )}
        <Pagination page={page} pages={pages} basePath={base} params={source ? { source } : {}} />
        {errors.total > 0 && (
          <ActionForm
            action={clearErrorsAction}
            confirm={source ? `Clear all ${sourceLabels[source]} errors?` : "Clear the whole error log?"}
            inline
          >
            <input type="hidden" name="source" value={source ?? ""} />
            <button className="text-link danger">
              Clear {source ? `${sourceLabels[source]} errors` : "all errors"}
            </button>
          </ActionForm>
        )}
      </section>
    </div>
  );
}
