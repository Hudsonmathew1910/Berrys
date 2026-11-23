import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getHelpPage } from "@/lib/content";
import { helpPages } from "@/lib/help-pages";
import { money } from "@/lib/catalog";
import { getSettings, shippingRule } from "@/lib/settings";

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

/** Live facts from Settings, so these pages never disagree with what checkout and refunds do. */
async function LiveFacts({ slug }: { slug: string }) {
  if (slug !== "contact" && slug !== "shipping-returns") return null;
  const s = await getSettings();
  if (slug === "contact") {
    const wa = s.whatsapp.replace(/\D/g, "");
    const rows: [string, React.ReactNode][] = [];
    if (s.supportEmail)
      rows.push([
        "Email",
        <a key="e" href={`mailto:${s.supportEmail}`}>
          {s.supportEmail}
        </a>,
      ]);
    if (s.supportPhone)
      rows.push([
        "Phone",
        <a key="p" href={`tel:${s.supportPhone.replace(/\s+/g, "")}`}>
          {s.supportPhone}
        </a>,
      ]);
    if (wa)
      rows.push([
        "WhatsApp",
        <a
          key="w"
          href={`https://wa.me/${wa.length === 10 ? "91" + wa : wa}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {s.whatsapp}
        </a>,
      ]);
    if (s.storeAddress)
      rows.push([
        "Address",
        <span key="a" className="pre-line">
          {s.storeAddress}
        </span>,
      ]);
    if (!rows.length) return null;
    return <Facts title="Contact details" rows={rows} />;
  }
  const rule = shippingRule(s);
  return (
    <Facts
      title="At a glance"
      rows={[
        ["Shipping", rule.fee ? `${money(rule.fee)} per order` : "Free on every order"],
        ...(rule.fee && rule.freeAbove
          ? [["Free shipping", `On orders of ${money(rule.freeAbove)} or more`] as [string, string]]
          : []),
        [
          "Returns",
          s.returnDays > 0
            ? `Ask for a refund within ${s.returnDays} days of delivery (My account → My orders)`
            : "Returns aren’t accepted after delivery",
        ],
      ]}
    />
  );
}

function Facts({ title, rows }: { title: string; rows: [string, React.ReactNode][] }) {
  return (
    <section className="help-facts" aria-label={title}>
      <h2>{title}</h2>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
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
      <LiveFacts slug={slug} />
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
