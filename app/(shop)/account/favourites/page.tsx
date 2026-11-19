import type { Metadata } from "next";
import { FavouritesView } from "@/components/shop/favourites-view";

export const metadata: Metadata = { title: "Favourites — Berry’s", robots: { index: false } };

export default function FavouritesPage() {
  return (
    <>
      <h1 className="page-title">Favourites</h1>
      <FavouritesView />
    </>
  );
}
