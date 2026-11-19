import Link from "next/link";
import { Search } from "lucide-react";

/** Site-wide "Page not found" (also what non-staff see at the dashboard address). */
export default function NotFound() {
  return (
    <div className="not-found-page">
      <Link href="/" className="site-brand" aria-label="Berry’s home">
        <span className="brand-mark">
          <img src="/images/berrys-mark.webp" alt="" />
        </span>
        <span className="brand-word">
          <b>BERRY’S</b>
          <small>CLOTHING BRAND</small>
        </span>
      </Link>
      <div className="empty-state page-empty">
        <Search size={40} />
        <h1>Page not found</h1>
        <p>The page you’re looking for doesn’t exist or may have moved.</p>
        <div className="success-actions">
          <Link className="primary" href="/">
            Go to the home page
          </Link>
          <Link className="outline" href="/shop">
            Browse the collection
          </Link>
        </div>
      </div>
    </div>
  );
}
