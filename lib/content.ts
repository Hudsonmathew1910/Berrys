import "server-only";
import { eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { getDb, schema } from "@/db";
import { helpPages } from "@/lib/help-pages";

/**
 * Website text editable from the dashboard (Content). Each block has a
 * default here, so the site works before anything is edited.
 */
export const contentDefaults = {
  announcement: {
    items: [
      "SMALL OUTFITS. BIG ADVENTURES.",
      "Thoughtful everyday wear, made for little ones",
      "MEET YOUR NEW LITTLE FAVOURITES",
    ],
  },
  home: {
    shelfTitle: "Find their next favourite.",
    shelfSubtitle: "Little outfits. Plenty of choice.",
    newInTitle: "New little favourites",
    storyEyebrow: "THE HEART OF BERRY’S",
    storyTitle: "Childhood is fleeting.",
    storyTitleEm: "Let them live in it.",
    storyText:
      "Clothes for cartwheels. For collecting pebbles. For the days that turn into the stories you tell. Berry’s is a little celebration of it all.",
  },
  /**
   * The three home page banners (first = large). Empty category = the
   * category in that position; empty image = the chosen product photo,
   * or the first product of the category.
   */
  banners: {
    items: [
      {
        eyebrow: "THE EVERYDAY WARDROBE",
        title: "Big on comfort.",
        titleEm: "Little on fuss.",
        text: "Ready-to-play co-ord sets",
        cta: "",
        category: "",
        productId: "",
        image: "",
      },
      {
        eyebrow: "",
        title: "Dress up the day.",
        titleEm: "",
        text: "",
        cta: "",
        category: "",
        productId: "",
        image: "",
      },
      {
        eyebrow: "",
        title: "Dream a little.",
        titleEm: "",
        text: "",
        cta: "",
        category: "",
        productId: "",
        image: "",
      },
    ],
  },
  footer: {
    tagline: "Little clothes. Lasting memories.",
    noteTitle: "Good things come in little sizes.",
    noteText: "Discover a wardrobe full of personality.",
  },
};
export type ContentKey = keyof typeof contentDefaults;
export type Banner = (typeof contentDefaults)["banners"]["items"][number];
export const bannerFields = [
  "eyebrow",
  "title",
  "titleEm",
  "text",
  "cta",
  "category",
  "productId",
  "image",
] as const;
export type Content<K extends ContentKey> = (typeof contentDefaults)[K];

/** Cache tag cleared by the dashboard whenever website content changes. */
export const CONTENT_TAG = "site-content";

const loadRows = unstable_cache(
  async () =>
    (
      await getDb()
        .select({ key: schema.siteContent.key, value: schema.siteContent.value })
        .from(schema.siteContent)
    ).map((r) => [r.key, r.value as Record<string, unknown>] as const),
  ["site-content-v1"],
  { tags: [CONTENT_TAG], revalidate: 600 },
);

const loadAll = cache(async () => new Map(await loadRows()));

/** A content block, with defaults filled in for any missing field. */
export async function getContent<K extends ContentKey>(key: K): Promise<Content<K>> {
  const saved = (await loadAll()).get(key) ?? {};
  return { ...contentDefaults[key], ...saved } as Content<K>;
}

export type HelpContent = { title: string; eyebrow: string; body: string };

/** Help page text: "## Heading" lines start a section; blank lines separate paragraphs. */
export function helpDefault(slug: string): HelpContent | null {
  const p = helpPages[slug];
  if (!p) return null;
  return {
    title: p.title,
    eyebrow: p.eyebrow,
    body: p.sections
      .map((s) => [s.heading ? `## ${s.heading}` : "", ...s.body].filter(Boolean).join("\n\n"))
      .join("\n\n"),
  };
}

export async function getHelpPage(slug: string): Promise<HelpContent | null> {
  const def = helpDefault(slug);
  if (!def) return null;
  const saved = (await loadAll()).get(`help:${slug}`) as Partial<HelpContent> | undefined;
  return { ...def, ...saved };
}

export async function saveContent(key: string, value: Record<string, unknown>, by: string) {
  await getDb()
    .insert(schema.siteContent)
    .values({ key, value, updatedBy: by })
    .onConflictDoUpdate({
      target: schema.siteContent.key,
      set: { value, updatedBy: by, updatedAt: new Date() },
    });
}

export async function resetContent(key: string) {
  await getDb().delete(schema.siteContent).where(eq(schema.siteContent.key, key));
}
