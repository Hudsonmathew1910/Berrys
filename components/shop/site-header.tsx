"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Heart, Menu, Search, ShoppingBag, Star, User, X } from "lucide-react";
import { useBag, useLikes } from "@/components/store/bag";

export type HeaderViewer = { name: string; email: string | null } | null;

/** Shared header for every customer page: announcement, logo, search, account, favourites, bag, categories. */
export function SiteHeader({
  viewer,
  categories,
  announcement,
}: {
  viewer: HeaderViewer;
  categories: string[];
  announcement: string[];
}) {
  const pathname = usePathname();
  const bag = useBag();
  const likes = useLikes();
  const [menuOpen, setMenuOpen] = useState(false);
  const bagCount = bag.reduce((a, l) => a + l.quantity, 0);
  const firstName = viewer?.name?.split(" ")[0];

  return (
    <>
      {announcement.some(Boolean) && (
        <div className="announcement">
          {announcement.map((t, i) => (
            <span key={i}>
              {t}
              {i === 1 && <Star size={11} />}
              {i === 2 && <ArrowUpRight size={12} />}
            </span>
          ))}
        </div>
      )}
      <header className="site-header">
        <button
          className="menu-toggle"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <Link className="site-brand" href="/" aria-label="Berry’s home">
          <span className="brand-mark">
            <img src="/images/berrys-mark.webp" alt="" />
          </span>
          <span className="brand-word">
            <b>BERRY’S</b>
            <small>CLOTHING BRAND</small>
          </span>
        </Link>
        <form className="store-search" role="search" action="/shop">
          <Search size={19} />
          <input
            name="q"
            aria-label="Search products"
            placeholder="Search co-ords, dresses, pyjamas & more"
          />
          <button type="submit" className="search-submit">
            Search
          </button>
        </form>
        <nav className="header-actions" aria-label="Your account">
          <Link className="shop-header-action" href={viewer ? "/account" : "/login"}>
            <span className="action-symbol">
              <User size={21} />
            </span>
            <span>{viewer ? firstName || "Account" : "Login"}</span>
          </Link>
          <Link className="shop-header-action" href="/account/favourites">
            <span className="action-symbol">
              <Heart size={21} />
              {likes.length > 0 && <span className="mini-count">{likes.length}</span>}
            </span>
            <span>Favourites</span>
          </Link>
          <Link className="shop-header-action" href="/cart">
            <span className="action-symbol">
              <ShoppingBag size={21} />
              {bagCount > 0 && <span className="mini-count">{bagCount}</span>}
            </span>
            <span>Bag</span>
          </Link>
        </nav>
      </header>
      <nav className={"site-nav" + (menuOpen ? " open" : "")} aria-label="Shop collections">
        <Link
          href="/shop"
          className={pathname === "/shop" ? "active" : ""}
          onClick={() => setMenuOpen(false)}
        >
          Shop all
        </Link>
        {categories.map((c) => (
          <Link key={c} href={`/shop?category=${encodeURIComponent(c)}`} onClick={() => setMenuOpen(false)}>
            {c}
          </Link>
        ))}
        <Link href="/help/our-story" className="nav-story" onClick={() => setMenuOpen(false)}>
          The Berry’s story <ArrowUpRight size={13} />
        </Link>
      </nav>
    </>
  );
}
