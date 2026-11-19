"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowUpRight, Heart, LayoutDashboard, Menu, Search, ShoppingBag, Star, User, X } from "lucide-react";
import { useBag, useLikes } from "@/components/store/bag";
import { GoogleIcon } from "./google-icon";

export type HeaderViewer = { name: string; email: string | null } | null;

/** "Login" dropdown button that reveals "Continue with Google" on hover or click */
function HeaderLoginMenu() {
  const pathname = usePathname();
  const search = useSearchParams();
  const here = pathname + (search.size ? `?${search}` : "");
  const next = pathname.startsWith("/login") ? "/account" : here;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest(".header-login-wrap")) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  return (
    <div
      className={`header-login-wrap ${open ? "open" : ""}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="header-login-btn"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span className="action-symbol">
          <User size={20} />
        </span>
        <span className="action-label">Sign in</span>
      </button>

      <div className="header-login-dropdown" role="menu">
        <a
          role="menuitem"
          className="google-signin-action"
          href={`/auth/google?next=${encodeURIComponent(next)}`}
          onClick={() => setOpen(false)}
        >
          <GoogleIcon size={18} />
          <span>Continue with Google</span>
        </a>
      </div>
    </div>
  );
}

/** Shared header for every customer page: announcement, logo, search, account, favourites, bag, categories. */
export function SiteHeader({
  viewer,
  categories,
  announcement,
  dashboardHref,
  brand = { name: "Berry’s", logo: "" },
}: {
  viewer: HeaderViewer;
  /** Website name and logo from Dashboard → Settings. */
  brand?: { name: string; logo: string };
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
        <Link className="site-brand" href="/" aria-label={`${brand.name} home`}>
          <span className="brand-mark">
            <img src={brand.logo || "/images/berrys-mark.webp"} alt="" />
          </span>
          <span className="brand-word">
            <b>{brand.name.toUpperCase()}</b>
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
            <a className="header-dashboard-link" href={dashboardHref} title="Staff Dashboard">
              <span className="action-symbol">
                <LayoutDashboard size={20} />
              </span>
              <span className="action-label">Dashboard</span>
            </a>
          )}
          {viewer ? (
            <Link className="shop-header-action" href="/account">
              <span className="action-symbol">
                <User size={20} />
              </span>
              <span className="action-label">{firstName || "Account"}</span>
            </Link>
          ) : (
            <Suspense fallback={<div className="header-login-skeleton" />}>
              <HeaderLoginMenu />
            </Suspense>
          )}
          <Link className="shop-header-action" href={viewer ? "/account#favourites" : "/favourites"}>
            <span className="action-symbol">
              <Heart size={20} />
              {likes.length > 0 && <span className="mini-count">{likes.length}</span>}
            </span>
            <span className="action-label">Favourites</span>
          </Link>
          <Link className="shop-header-action" href="/cart">
            <span className="action-symbol">
              <ShoppingBag size={20} />
              {bagCount > 0 && <span className="mini-count">{bagCount}</span>}
            </span>
            <span className="action-label">Bag</span>
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
