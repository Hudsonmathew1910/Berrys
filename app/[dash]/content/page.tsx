import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getCategories } from "@/lib/categories";
import { contentDefaults, getContent, getHelpPage } from "@/lib/content";
import { listAdminProducts } from "@/lib/admin/catalog";
import { helpPages } from "@/lib/help-pages";
import { requirePage } from "@/lib/staff";
import { ActionForm } from "@/components/dashboard/action-form";
import { BannerEditor } from "@/components/dashboard/banner-editor";
import { resetContentAction, saveContentAction } from "../actions";

const labels: Record<string, string> = {
  shelfTitle: "Home heading",
  shelfSubtitle: "Home sub-heading",
  newInTitle: "“New in” section title",
  storyEyebrow: "Story — small label",
  storyTitle: "Story — title",
  storyTitleEm: "Story — title (second line)",
  storyText: "Story — text",
  tagline: "Footer tagline",
  noteTitle: "Footer note — title",
  noteText: "Footer note — text",
};

function Reset({ k }: { k: string }) {
  return (
    <ActionForm action={resetContentAction} confirm="Restore the original text for this block?" inline>
      <input type="hidden" name="key" value={k} />
      <button className="text-link">Restore original</button>
    </ActionForm>
  );
}

export default async function ContentPage() {
  await requirePage("content");
  const [announcement, home, footer, help, banners, cats, products] = await Promise.all([
    getContent("announcement"),
    getContent("home"),
    getContent("footer"),
    Promise.all(Object.keys(helpPages).map(async (slug) => [slug, await getHelpPage(slug)] as const)),
    getContent("banners"),
    getCategories(),
    listAdminProducts({ status: "active", page: 1, perPage: 500 }),
  ]);
  const blocks = [
    ["home", "Home page", home],
    ["footer", "Footer", footer],
  ] as const;

  return (
    <div className="dash-page">
      <div className="dash-heading">
        <div>
          <h1>Website content</h1>
          <span className="muted">Changes appear on the website as soon as you save.</span>
        </div>
        <Link className="outline" href="/" target="_blank">
          View website <ArrowUpRight size={14} />
        </Link>
      </div>
      <div className="dash-grid">
        <section className="dash-panel wide">
          <h2>Home page banners</h2>
          <p className="muted">
            Leave a field empty to use the automatic choice. Upload a photo, or pick a product to use its
            photo.
          </p>
          <BannerEditor
            initial={banners.items}
            categories={cats.map((c) => c.name)}
            products={products.rows.map((p) => ({
              id: p.id,
              name: p.name,
              category: p.category,
              image: p.image,
            }))}
          />
          <Reset k="banners" />
        </section>

        <section className="dash-panel wide">
          <h2>Announcement bar (top of every page)</h2>
          <ActionForm action={saveContentAction}>
            <input type="hidden" name="key" value="announcement" />
            <div className="form-grid three">
              {[0, 1, 2].map((i) => (
                <label key={i}>
                  Message {i + 1}
                  <input name={`item${i}`} maxLength={120} defaultValue={announcement.items[i] ?? ""} />
                </label>
              ))}
            </div>
            <button className="primary">Save</button>
          </ActionForm>
          <Reset k="announcement" />
        </section>

        {blocks.map(([key, title, values]) => (
          <section key={key} className="dash-panel wide">
            <h2>{title}</h2>
            <ActionForm action={saveContentAction}>
              <input type="hidden" name="key" value={key} />
              <div className="form-grid">
                {Object.keys(contentDefaults[key]).map((field) => {
                  const v = String((values as Record<string, string>)[field] ?? "");
                  return (
                    <label key={field} className={v.length > 80 ? "wide" : ""}>
                      {labels[field] ?? field}
                      {v.length > 80 ? (
                        <textarea name={field} rows={3} maxLength={1000} defaultValue={v} />
                      ) : (
                        <input name={field} maxLength={1000} defaultValue={v} />
                      )}
                    </label>
                  );
                })}
              </div>
              <button className="primary">Save</button>
            </ActionForm>
            <Reset k={key} />
          </section>
        ))}

        {help.map(([slug, page]) =>
          page ? (
            <section key={slug} className="dash-panel wide">
              <h2>
                Help page: {page.title}{" "}
                <Link className="text-link" href={`/help/${slug}`} target="_blank">
                  view <ArrowUpRight size={12} />
                </Link>
              </h2>
              <ActionForm action={saveContentAction}>
                <input type="hidden" name="key" value={`help:${slug}`} />
                <div className="form-grid">
                  <label>
                    Title
                    <input name="title" required maxLength={100} defaultValue={page.title} />
                  </label>
                  <label>
                    Small label
                    <input name="eyebrow" maxLength={60} defaultValue={page.eyebrow} />
                  </label>
                  <label className="wide">
                    Text — blank line between paragraphs; start a line with “## ” for a heading
                    <textarea name="body" rows={8} maxLength={20000} defaultValue={page.body} />
                  </label>
                </div>
                <button className="primary">Save</button>
              </ActionForm>
              <Reset k={`help:${slug}`} />
            </section>
          ) : null,
        )}
      </div>
    </div>
  );
}
