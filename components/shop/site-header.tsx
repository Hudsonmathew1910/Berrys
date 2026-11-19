"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowUpRight, Heart, LayoutDashboard, Menu, Search, ShoppingBag, Star, User, X } from "lucide-react";
import { useBag, useLikes } from "@/components/store/bag";
import { GoogleIcon } from "./google-icon";

export type HeaderViewer = { name: string; email: string | null } | null;

/** "Continue with Google" that brings the visitor back to the page they were on. */
function GoogleButton() {
  const pathname = usePathname();
  const search = useSearchParams();
  const here = pathname + (search.size ? `?${search}` : "");
  const next = pathname.startsWith("/login") ? "/account" : here;
  return (
    <a className="header-google" href={`/auth/google?next=${encodeURIComponent(next)}`}>
      <GoogleIcon size={17} />
      <span className="long">Continue with Google</span>
      <span className="short">Sign in</span>
    </a>
  );
}

/** Shared header for every customer page: announcement, logo, search, account, favourites, bag, categories. */
export function SiteHeader({
  viewer,
  categories,
  announcement,
  dashboardHref,
}: {
  viewer: HeaderViewer;
  categories: string[];
  announcement: string[];
  /** Only for logged-in staff and admins. */
  dashboardHref?: string;
}) {
  const pathname = usePathname();
  const bag = useBag();
  const likes = useLikes();
  const [menuOpen, setMenuOpen] = useState(false);
  const bagCount = bag.reduce((a, l) => a + l.quantity, 0);
  const firstName = viewer?.name?.split(" ")[0];

  // Close the mobile menu after navigating.
  useEffect(() => {
    const t = setTimeout(() => setMenuOpen(false), 0);
    return () => clearTimeout(t);
  }, [pathname]);

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
          aria-expanded={menuOpen}
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
            type="search"
            enterKeyHint="search"
            aria-label="Search products"
            placeholder="Search co-ords, dresses, pyjamas & more"
          />
          <button type="submit" className="search-submit">
            Search
          </button>
        </form>
        <nav className="header-actions" aria-label="Your account">
          {dashboardHref && (
            <a className="header-dashboard" href={dashboardHref}>
              <LayoutDashboard size={17} />
              <span>Dashboard</span>
            </a>
          )}
          {viewer ? (
            <Link className="shop-header-action" href="/account">
              <span className="action-symbol">
                <User size={21} />
              </span>
              <span>{firstName || "Account"}</span>
            </Link>
          ) : (
            <Suspense fallback={<span className="header-google placeholder" />}>
              <GoogleButton />
            </Suspense>
          )}
          <Link className="shop-header-action" href={viewer ? "/account#favourites" : "/favourites"}>
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
        <Link href="/shop" className={pathname === "/shop" ? "active" : ""}>
          Shop all
        </Link>
        {categories.map((c) => (
          <Link key={c} href={`/shop?category=${encodeURIComponent(c)}`}>
            {c}
          </Link>
        ))}
        <Link href="/help/our-story" className="nav-story">
          The Berry’s story <ArrowUpRight size={13} />
        </Link>
      </nav>
    </>
  );
}
