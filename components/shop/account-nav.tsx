"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, LogOut, MapPin, Package, ShoppingBag, User } from "lucide-react";

const links = [
  ["/account", "Account details", User],
  ["/account/orders", "My orders", Package],
  ["/account/favourites", "Favourites", Heart],
  ["/account/addresses", "Addresses", MapPin],
  ["/cart", "My bag", ShoppingBag],
] as const;

export function AccountNav({ name, avatar }: { name: string; avatar: string }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/account" ? pathname === "/account" : pathname === href || pathname.startsWith(href + "/");
  return (
    <aside className="account-nav">
      <div className="account-who">
        {avatar ? (
          <img src={avatar} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="avatar-fallback">{name.slice(0, 1).toUpperCase()}</span>
        )}
        <div>
          <small>Hello,</small>
          <b>{name.split(" ")[0]}</b>
        </div>
      </div>
      <nav aria-label="Account">
        {links.map(([href, label, Icon]) => (
          <Link key={href} href={href} className={isActive(href) ? "active" : ""}>
            <Icon size={17} /> {label}
          </Link>
        ))}
        <form action="/auth/signout" method="post">
          <button type="submit">
            <LogOut size={17} /> Log out
          </button>
        </form>
      </nav>
    </aside>
  );
}
