import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Page numbers with « prev / next », keeping the other query parameters. */
export function Pagination({
  page,
  pages,
  basePath,
  params,
}: {
  page: number;
  pages: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  if (pages <= 1) return null;
  const href = (n: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (n > 1) q.set("page", String(n));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  // 1 … 4 5 [6] 7 8 … 20
  const nums = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2]);
  const list = [...nums].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);

  return (
    <nav className="pagination" aria-label="Pages">
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev" aria-label="Previous page">
          <ChevronLeft size={16} /> Prev
        </Link>
      ) : (
        <span className="disabled">
          <ChevronLeft size={16} /> Prev
        </span>
      )}
      {list.map((n, i) => (
        <span key={n} className="page-group">
          {i > 0 && n - list[i - 1] > 1 && <span className="ellipsis">…</span>}
          {n === page ? (
            <span className="current" aria-current="page">
              {n}
            </span>
          ) : (
            <Link href={href(n)}>{n}</Link>
          )}
        </span>
      ))}
      {page < pages ? (
        <Link href={href(page + 1)} rel="next" aria-label="Next page">
          Next <ChevronRight size={16} />
        </Link>
      ) : (
        <span className="disabled">
          Next <ChevronRight size={16} />
        </span>
      )}
    </nav>
  );
}
