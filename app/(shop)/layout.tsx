import { getViewer } from "@/lib/auth";
import { getCategories } from "@/lib/categories";
import { getContent } from "@/lib/content";
import { adminHref, getStaffForViewer } from "@/lib/staff";
import { SiteFooter } from "@/components/shop/site-footer";
import { SiteHeader } from "@/components/shop/site-header";
import { ToastProvider } from "@/components/store/toast";

/**
 * The base template for every customer page: shared header (logo, search,
 * account, favourites, bag, categories) and footer. Pages render inside <main>.
 */
export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const [viewer, categories, announcement, staff] = await Promise.all([
    getViewer(),
    getCategories(),
    getContent("announcement"),
    getStaffForViewer(),
  ]);
  return (
    <ToastProvider>
      <SiteHeader
        viewer={viewer ? { name: viewer.name, email: viewer.email } : null}
        categories={categories.map((c) => c.name)}
        announcement={announcement.items}
        dashboardHref={staff ? adminHref() : undefined}
      />
      <main className="site-main">{children}</main>
      <SiteFooter />
    </ToastProvider>
  );
}
