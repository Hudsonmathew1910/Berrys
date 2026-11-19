"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Heart, LogOut, MapPin, Package, ShoppingBag, User } from "lucide-react";

export const accountSections = [
  ["details", "Account details", User],
  ["orders", "My orders", Package],
  ["favourites", "Favourites", Heart],
  ["addresses", "Addresses", MapPin],
  ["bag", "My bag", ShoppingBag],
] as const;

/**
 * Account menu. On /account it scrolls smoothly to each section and
 * highlights the one in view; elsewhere (an order page) it links back.
 */
export function AccountNav({ name, avatar }: { name: string; avatar: string }) {
  const pathname = usePathname();
  const onAccount = pathname === "/account";
  const [active, setActive] = useState("details");

  useEffect(() => {
    if (!onAccount) return;
    const els = accountSections
      .map(([id]) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [onAccount]);

  function go(e: React.MouseEvent, id: string) {
    if (!onAccount) return; // normal navigation to /account#id
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
    setActive(id);
  }

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
        {accountSections.map(([id, label, Icon]) => (
          <Link
            key={id}
            href={`/account#${id}`}
            className={onAccount && active === id ? "active" : ""}
            aria-current={onAccount && active === id ? "true" : undefined}
            onClick={(e) => go(e, id)}
          >
            <Icon size={17} /> <span>{label}</span>
          </Link>
        ))}
        <form action="/auth/signout" method="post">
          <button type="submit">
            <LogOut size={17} /> <span>Log out</span>
          </button>
        </form>
      </nav>
    </aside>
  );
}
