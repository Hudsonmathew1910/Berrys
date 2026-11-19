import Link from "next/link";
import { Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="empty-state page-empty">
      <Search size={40} />
      <h1>We couldn’t find that page.</h1>
      <p>It may have moved, or the piece may no longer be available.</p>
      <Link className="primary" href="/shop">
        Browse the collection
      </Link>
    </div>
  );
}
