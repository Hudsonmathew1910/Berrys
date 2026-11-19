import { getViewer } from "@/lib/auth";
import { getCategories } from "@/lib/categories";
import { getContent } from "@/lib/content";
import { SiteFooter } from "@/components/shop/site-footer";
import { SiteHeader } from "@/components/shop/site-header";
import { ToastProvider } from "@/components/store/toast";

/**
 * The base template for every customer page: shared header (logo, search,
 * account, favourites, bag, categories) and footer. Pages render inside <main>.
 */
export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const [viewer, categories, announcement] = await Promise.all([
    getViewer(),
    getCategories(),
    getContent("announcement"),
  ]);
  return (
    <ToastProvider>
      <SiteHeader
        viewer={viewer ? { name: viewer.name, email: viewer.email } : null}
        categories={categories.map((c) => c.name)}
        announcement={announcement.items}
      />
      <main className="site-main">{children}</main>
      <SiteFooter />
    </ToastProvider>
  );
}
