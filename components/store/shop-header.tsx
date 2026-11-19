"use client";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Heart, Menu, Search, ShoppingBag, Star, User, X } from "lucide-react";
import { categories } from "@/lib/catalog";

type Props = {
  query: string;
  onQuery: (q: string) => void;
  onSubmitSearch: () => void;
  category: string;
  favouritesOnly: boolean;
  likesCount: number;
  bagCount: number;
  signedIn: boolean;
  onShop: (category?: string) => void;
  onFavourites: () => void;
  onOpenBag: () => void;
  onStory: () => void;
};

export function ShopHeader(p: Props) {
  return (
    <>
      <div className="announcement">
        <span>SMALL OUTFITS. BIG ADVENTURES.</span>
        <span>
          Thoughtful everyday wear, made for little ones <Star size={11} />
        </span>
        <span>
          MEET YOUR NEW LITTLE FAVOURITES <ArrowUpRight size={12} />
        </span>
      </div>
      <header className="main-header shop-header">
        <Link className="brand" href="/" aria-label="Berry’s home">
          <img src="/images/berrys-logo.png" alt="Berry’s name and cherry symbol" />
        </Link>
        <form
          className="store-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            p.onSubmitSearch();
          }}
        >
          <Search size={19} />
          <input
            aria-label="Search products"
            placeholder="Search for co-ords, dresses, pyjamas & more"
            value={p.query}
            onChange={(e) => p.onQuery(e.target.value)}
          />
          {p.query && (
            <button
              type="button"
              className="search-clear"
              aria-label="Clear search"
              onClick={() => p.onQuery("")}
            >
              <X size={16} />
            </button>
          )}
          <button type="submit" className="search-submit">
            Search <ArrowRight size={17} />
          </button>
        </form>
        <div className="header-actions">
          <Link className="shop-header-action" href={p.signedIn ? "/account" : "/login?next=/account"}>
            <span className="action-symbol">
              <User size={21} />
            </span>
            <span>{p.signedIn ? "My account" : "Login"}</span>
          </Link>
          <button className="shop-header-action" onClick={p.onFavourites}>
            <span className="action-symbol">
              <Heart size={21} />
              {p.likesCount > 0 && <span className="mini-count">{p.likesCount}</span>}
            </span>
            <span>Favourites</span>
          </button>
          <button className="shop-header-action" onClick={p.onOpenBag}>
            <span className="action-symbol">
              <ShoppingBag size={21} />
              <span className="mini-count">{p.bagCount}</span>
            </span>
            <span>My bag</span>
          </button>
        </div>
      </header>
      <nav className="shop-nav" aria-label="Shop collections">
        <div>
          <button
            className={p.category === "All pieces" && !p.favouritesOnly ? "active" : ""}
            onClick={() => p.onShop()}
          >
            <Menu size={16} />
            Shop all
          </button>
          {categories.slice(1).map((c) => (
            <button key={c} className={p.category === c ? "active" : ""} onClick={() => p.onShop(c)}>
              {c}
            </button>
          ))}
        </div>
        <button className="nav-story" onClick={p.onStory}>
          The Berry’s story <ArrowUpRight size={13} />
        </button>
      </nav>
    </>
  );
}
