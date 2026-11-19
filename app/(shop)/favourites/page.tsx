import type { Metadata } from "next";
import Link from "next/link";
import { FavouritesView } from "@/components/shop/favourites-view";

export const metadata: Metadata = { title: "Favourites — Berry’s", robots: { index: false } };

/** Favourites for visitors who aren't logged in (saved in this browser). */
export default function FavouritesPage() {
  return (
    <div className="page-section">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link> / Favourites
      </nav>
      <h1 className="page-title">Favourites</h1>
      <FavouritesView />
    </div>
  );
}
