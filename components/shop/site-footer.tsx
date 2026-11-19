import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getCategories } from "@/lib/categories";
import { getContent } from "@/lib/content";

/** Shared footer. Its background matches the logo artwork (#183147). */
export async function SiteFooter() {
  const [categories, text] = await Promise.all([getCategories(), getContent("footer")]);
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div className="footer-brand">
          <img src="/images/berrys-logo-full.webp" alt="Berry’s Clothing Brand, est. 2026" />
          <p>{text.tagline}</p>
        </div>
        <div>
          <h4>THE LITTLE WARDROBE</h4>
          {categories.slice(0, 6).map((c) => (
            <Link key={c.id} href={`/shop?category=${encodeURIComponent(c.name)}`}>
              {c.name}
            </Link>
          ))}
        </div>
        <div>
          <h4>HERE TO HELP</h4>
          <Link href="/help/size-guide">Size guide</Link>
          <Link href="/help/shipping-returns">Shipping & returns</Link>
          <Link href="/help/contact">Get in touch</Link>
          <Link href="/account#orders">Track my order</Link>
        </div>
        <div className="footer-note">
          <span className="eyebrow">A LITTLE NOTE</span>
          <h3>{text.noteTitle}</h3>
          <p>{text.noteText}</p>
          <Link className="text-link" href="/shop">
            Find their favourite <ArrowRight size={16} />
          </Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} Berry’s Clothing Brand. All rights reserved.</span>
        <span>
          <Link href="/help/privacy">Privacy</Link> · <Link href="/help/terms">Terms</Link> · Secure payments
          by Razorpay
        </span>
        <span>MADE WITH A LITTLE LOVE ♡</span>
      </div>
    </footer>
  );
}
