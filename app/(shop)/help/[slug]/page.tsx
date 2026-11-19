import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { helpPages } from "@/lib/help-pages";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return Object.keys(helpPages).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = helpPages[(await params).slug];
  return { title: page ? `${page.title} — Berry’s` : "Not found — Berry’s" };
}

export default async function HelpPage({ params }: Props) {
  const { slug } = await params;
  const page = helpPages[slug];
  if (!page) notFound();
  return (
    <div className="page-section narrow help-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link> / Help / {page.title}
      </nav>
      <div className="eyebrow">{page.eyebrow}</div>
      <h1 className="page-title">{page.title}</h1>
      {page.sections.map((s, i) => (
        <section key={i}>
          {s.heading && <h2>{s.heading}</h2>}
          {s.body.map((p, j) => (
            <p key={j}>{p}</p>
          ))}
        </section>
      ))}
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
