import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listOffers } from "@/lib/admin/catalog";
import { getCategories } from "@/lib/categories";
import { getContent } from "@/lib/content";
import { getSettings } from "@/lib/settings";
import { can, getStaffForViewer } from "@/lib/staff";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
import { HomeTemplate } from "@/components/dashboard/home-template";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Home page template", robots: { index: false, follow: false } };

/**
 * The home page template shown inside Website content → Preview. Team members who edit content
 * only; the text comes live from the dashboard forms (saved or not).
 */
export default async function ContentPreviewPage() {
  const staff = await getStaffForViewer();
  if (!staff || !can(staff, "content")) notFound();
  const [announcement, home, banners, sections, footer, cats, offers, settings, products] = await Promise.all(
    [
      getContent("announcement"),
      getContent("home"),
      getContent("banners"),
      getContent("homeSections"),
      getContent("footer"),
      getCategories(),
      listOffers(),
      getSettings(),
      getDb()
        .select({ id: schema.products.id, category: schema.products.category, image: schema.products.image })
        .from(schema.products)
        .where(eq(schema.products.active, true))
        .limit(500),
    ],
  );
  const now = new Date();
  return (
    <HomeTemplate
      fixed={{
        brand: { name: settings.siteName, logo: settings.logoUrl },
        categories: cats.map((c) => ({ name: c.name, description: c.description })),
        products,
        offers: offers.map((o) => ({
          id: o.id,
          name: o.name,
          label: o.type === "percent" ? `${o.value}% off` : `₹${o.value.toLocaleString("en-IN")} off`,
          covers:
            o.scope === "all"
              ? "Everything in the store"
              : o.scope === "category"
                ? o.targets.join(", ")
                : `${o.targets.length} chosen piece${o.targets.length === 1 ? "" : "s"}`,
          live: o.active && o.startsAt <= now && (!o.endsAt || o.endsAt > now),
        })),
      }}
      initial={{
        announcement: announcement.items,
        home: home as unknown as Record<string, string>,
        banners: banners.items as unknown as Record<string, string>[],
        sections: { ...sections },
        footer: footer as unknown as Record<string, string>,
      }}
    />
  );
}
