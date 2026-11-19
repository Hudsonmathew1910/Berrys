import { after } from "next/server";
import { getViewer } from "@/lib/auth";
import { maybePurgeDemoOrders } from "@/lib/orders";
import { getCategories } from "@/lib/categories";
import { getContent } from "@/lib/content";
import { getSettings } from "@/lib/settings";
import { adminHref, getStaffForViewer } from "@/lib/staff";
import { MaintenancePage } from "@/components/shop/maintenance-page";
import { SiteFooter } from "@/components/shop/site-footer";
import { SiteHeader } from "@/components/shop/site-header";
import { ToastProvider } from "@/components/store/toast";

/**
 * The base template for every customer page: shared header (logo, search,
 * account, favourites, bag, categories) and footer. Pages render inside <main>.
 * In maintenance mode (Dashboard → Settings) customers see a holding page;
 * the team still sees the shop, with a reminder bar.
 */
export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const [viewer, categories, announcement, staff, settings] = await Promise.all([
    getViewer(),
    getCategories(),
    getContent("announcement"),
    getStaffForViewer(),
    getSettings(),
  ]);
  // Deletes demo orders older than a minute (throttled; runs after the page is sent).
  after(maybePurgeDemoOrders);
  if (settings.maintenance && !staff) return <MaintenancePage settings={settings} loggedIn={!!viewer} />;
  return (
    <ToastProvider>
      {settings.maintenance && (
        <div className="maintenance-bar">
          Maintenance mode is ON — customers see the “we’ll be back soon” page.{" "}
          <a href={adminHref("settings")}>Turn it off</a>
        </div>
      )}
      <SiteHeader
        viewer={viewer ? { name: viewer.name, email: viewer.email } : null}
        categories={categories.map((c) => c.name)}
        announcement={announcement.items}
        dashboardHref={staff ? adminHref() : undefined}
        brand={{ name: settings.siteName, logo: settings.logoUrl }}
      />
      <main className="site-main">{children}</main>
      <SiteFooter />
    </ToastProvider>
  );
}
