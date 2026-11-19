import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Lock, LogOut } from "lucide-react";
import { pendingRequestCount } from "@/lib/admin/team";
import { refundRequestCounts } from "@/lib/refunds";
import { adminHref, adminPath, can, getDashboardContext, roleLabels } from "@/lib/staff";
import { DashFrame } from "@/components/dashboard/dash-frame";
import { DashNav, type NavItem } from "@/components/dashboard/dash-nav";
import { UnlockScreen } from "@/components/dashboard/unlock-screen";
import { ToastProvider } from "@/components/store/toast";
import { emailConfigured } from "@/lib/email";
import { getSettings } from "@/lib/settings";
import { lockAction } from "./actions";
import "../dashboard.css";

export const metadata: Metadata = { title: "Workspace — Berry’s", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * The dashboard lives at /<ADMIN_PATH>. Every other single-segment address,
 * and this one for anyone who isn't active staff, is "Page not found".
 */
export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ dash: string }>;
}) {
  if ((await params).dash !== adminPath()) notFound();
  const { staff, unlocked } = await getDashboardContext();
  if (!unlocked) {
    const settings = await getSettings();
    return (
      <UnlockScreen
        email={staff.email ?? ""}
        firstTime={!staff.passwordHash}
        canReset={settings.dashboardPasswordReset && emailConfigured() && !!staff.email}
      />
    );
  }

  const isAdmin = staff.role === "admin";
  const roleLabel = staff.role === "admin" ? "SHOP ADMIN" : "SHOP STAFF";
  const [pending, refundCounts] = await Promise.all([
    isAdmin ? pendingRequestCount() : 0,
    can(staff, "orders") ? refundRequestCounts() : { requested: 0, verified: 0 },
  ]);
  const all: (NavItem & { show: boolean })[] = [
    { key: "overview", label: "Overview", href: adminHref(), show: true },
    {
      key: "orders",
      label: "Orders",
      href: adminHref("orders"),
      show: can(staff, "orders"),
      badge: isAdmin ? 0 : refundCounts.requested,
    },
    { key: "products", label: "Products", href: adminHref("products"), show: can(staff, "products") },
    { key: "categories", label: "Categories", href: adminHref("categories"), show: can(staff, "categories") },
    { key: "offers", label: "Offers", href: adminHref("offers"), show: can(staff, "offers") },
    { key: "stock", label: "Stock", href: adminHref("stock"), show: can(staff, "stock") },
    { key: "payments", label: "Payments", href: adminHref("payments"), show: can(staff, "payments") },
    { key: "customers", label: "Customers", href: adminHref("customers"), show: can(staff, "customers") },
    {
      key: "analytics",
      label: "Sales & analytics",
      href: adminHref("analytics"),
      show: can(staff, "analytics"),
    },
    { key: "content", label: "Website content", href: adminHref("content"), show: can(staff, "content") },
    {
      key: "requests",
      label: "Requests",
      href: adminHref("requests"),
      show: isAdmin,
      badge: pending + refundCounts.requested + refundCounts.verified,
    },
    { key: "team", label: "Team & access", href: adminHref("team"), show: isAdmin },
    { key: "activity", label: "Activity log", href: adminHref("activity"), show: isAdmin },
    { key: "errors", label: "Error log", href: adminHref("errors"), show: isAdmin },
    { key: "settings", label: "Settings", href: adminHref("settings"), show: isAdmin },
    { key: "account", label: "My account", href: adminHref("account"), show: true },
  ];

  return (
    <ToastProvider>
      <DashFrame
        home={adminHref()}
        roleLabel={roleLabel}
        sidebar={
          <>
            <Link href={adminHref()} className="dash-logo">
              <img src="/images/berrys-logo-full.webp" alt="Berry’s" />
            </Link>
            <div className="dash-role">{roleLabel}</div>
            <DashNav items={all.filter((i) => i.show)} base={adminHref()} />
            <div className="dash-sidebar-bottom">
              <Link href="/" target="_blank">
                <ArrowUpRight size={16} /> View shop
              </Link>
              <form action={lockAction}>
                <button type="submit">
                  <Lock size={16} /> Lock dashboard
                </button>
              </form>
              <form action="/auth/signout" method="post">
                <button type="submit">
                  <LogOut size={16} /> Log out
                </button>
              </form>
            </div>
          </>
        }
      >
        <div className="dash-main">
          <header className="dash-top">
            <span>Berry’s workspace</span>
            <span className="owner-pill">
              <span />
              {staff.email} · {roleLabels[staff.role]}
            </span>
          </header>
          {children}
        </div>
      </DashFrame>
    </ToastProvider>
  );
}
