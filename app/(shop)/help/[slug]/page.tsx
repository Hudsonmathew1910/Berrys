import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getHelpPage } from "@/lib/content";
import { helpPages } from "@/lib/help-pages";

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await getHelpPage((await params).slug);
  return { title: page ? `${page.title} — Berry’s` : "Not found — Berry’s" };
}

/** Text from the dashboard: "## Heading" lines and blank-line separated paragraphs. */
function Body({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block, i) =>
          block.startsWith("## ") ? <h2 key={i}>{block.slice(3)}</h2> : <p key={i}>{block}</p>,
        )}
    </>
  );
}

export default async function HelpPage({ params }: Props) {
  const { slug } = await params;
  const page = await getHelpPage(slug);
  if (!page) notFound();
  return (
    <div className="page-section narrow help-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link> / Help / {page.title}
      </nav>
      <div className="eyebrow">{page.eyebrow}</div>
      <h1 className="page-title">{page.title}</h1>
      <section>
        <Body text={page.body} />
      </section>
      <nav className="help-links" aria-label="More help">
        {Object.entries(helpPages)
          .filter(([k]) => k !== slug)
          .map(([k, v]) => (
            <Link key={k} href={`/help/${k}`}>
              {v.title}
            </Link>
          ))}
      </nav>
    </div>
  );
}
