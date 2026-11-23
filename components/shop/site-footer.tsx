import Link from "next/link";
import { ArrowRight, Mail, MessageCircle, Phone } from "lucide-react";
import { getCategories } from "@/lib/categories";
import { getContent } from "@/lib/content";
import { getSettings } from "@/lib/settings";

const socialNames = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  x: "X",
  pinterest: "Pinterest",
};

/** Shared footer. Its background matches the logo artwork (#183147). */
export async function SiteFooter() {
  const [categories, text, s] = await Promise.all([getCategories(), getContent("footer"), getSettings()]);
  const socials = (Object.keys(socialNames) as (keyof typeof socialNames)[]).filter((k) => s[k]);
  const wa = s.whatsapp.replace(/\D/g, "");
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div className="footer-brand">
          {s.logoUrl ? (
            <span className="footer-brand-custom">
              <img src={s.logoUrl} alt="" />
              <b>{s.siteName.toUpperCase()}</b>
            </span>
          ) : (
            <img src="/images/berrys-logo-full.webp" alt="Berry’s Clothing Brand, est. 2026" />
          )}
          <p>{text.tagline}</p>
          {(s.supportEmail || s.supportPhone || wa) && (
            <div className="footer-contact">
              {s.supportEmail && (
                <a href={`mailto:${s.supportEmail}`}>
                  <Mail size={15} /> {s.supportEmail}
                </a>
              )}
              {s.supportPhone && (
                <a href={`tel:${s.supportPhone.replace(/\s+/g, "")}`}>
                  <Phone size={15} /> {s.supportPhone}
                </a>
              )}
              {wa && (
                <a
                  href={`https://wa.me/${wa.length === 10 ? "91" + wa : wa}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle size={15} /> WhatsApp us
                </a>
              )}
            </div>
          )}
          {socials.length > 0 && (
            <div className="footer-social">
              {socials.map((k) => (
                <a key={k} href={s[k]} target="_blank" rel="noopener noreferrer">
                  {socialNames[k]}
                </a>
              ))}
            </div>
          )}
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
        <span>
          © {new Date().getFullYear()} {s.siteName}. All rights reserved.
        </span>
        <span>
          <Link href="/help/privacy">Privacy</Link> · <Link href="/help/terms">Terms</Link>
          {s.paymentMode === "razorpay" && " · Secure payments by Razorpay"}
        </span>
        <span>MADE WITH A LITTLE LOVE ♡</span>
      </div>
    </footer>
  );
}
