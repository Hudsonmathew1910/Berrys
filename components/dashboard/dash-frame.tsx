"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

/**
 * Dashboard frame: on desktop the sidebar is fixed on the left; on phones it
 * becomes a slide-in drawer opened from a compact top bar, and closes after
 * choosing a page.
 */
export function DashFrame({
  sidebar,
  children,
  home,
  roleLabel,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  home: string;
  roleLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className={"dash-shell" + (open ? " menu-open" : "")}>
      <div className="dash-mobilebar">
        <button
          className="dash-menu-btn"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Menu size={22} />
        </button>
        <Link href={home} className="dash-mobile-logo" aria-label="Dashboard home">
          <img src="/images/berrys-mark.webp" alt="" />
          <span>
            <b>BERRY’S</b>
            <small>{roleLabel}</small>
          </span>
        </Link>
      </div>
      <div className="dash-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
      <aside className="dash-sidebar" aria-label="Dashboard menu">
        <button className="dash-close-btn" aria-label="Close menu" onClick={() => setOpen(false)}>
          <X size={22} />
        </button>
        {sidebar}
      </aside>
      {children}
    </div>
  );
}
