"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ClipboardCheck,
  CreditCard,
  FileText,
  History,
  LayoutDashboard,
  Package,
  Percent,
  Shapes,
  ShoppingBag,
  UserCog,
  Users,
  Warehouse,
} from "lucide-react";

const icons = {
  overview: LayoutDashboard,
  orders: ShoppingBag,
  products: Boxes,
  categories: Shapes,
  offers: Percent,
  stock: Warehouse,
  payments: CreditCard,
  customers: Users,
  analytics: BarChart3,
  content: FileText,
  requests: ClipboardCheck,
  team: UserCog,
  activity: History,
  account: Package,
} as const;

export type NavItem = { key: keyof typeof icons; label: string; href: string; badge?: number };

export function DashNav({ items, base }: { items: NavItem[]; base: string }) {
  const pathname = usePathname();
  return (
    <nav className="dash-nav" aria-label="Dashboard">
      {items.map((it) => {
        const Icon = icons[it.key];
        const active = it.href === base ? pathname === base : pathname.startsWith(it.href);
        return (
          <Link key={it.key} href={it.href} className={active ? "active" : ""}>
            <Icon size={17} />
            {it.label}
            {!!it.badge && <span className="nav-badge">{it.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
