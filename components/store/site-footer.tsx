"use client";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { InfoTopic } from "./info-modal";

export function StoryBlock({ onStory }: { onStory: () => void }) {
  return (
    <section className="story-block">
      <div className="story-photo">
        <img
          src="/images/product-5.webp"
          alt="A little floral dress, ready for everyday adventures"
          loading="lazy"
        />
        <span>THE DETAILS MAKE THE DIFFERENCE.</span>
      </div>
      <div className="story-copy">
        <div className="eyebrow">THE HEART OF BERRY’S</div>
        <h2>
          Childhood is fleeting.
          <br />
          <em>Let them live in it.</em>
        </h2>
        <p>
          Clothes for cartwheels. For collecting pebbles. For the days that turn into the stories you tell.
          Berry’s is a little celebration of it all.
        </p>
        <button className="text-link" onClick={onStory}>
          Get to know Berry’s <ArrowUpRight size={18} />
        </button>
      </div>
    </section>
  );
}

export function SiteFooter({
  onShop,
  onInfo,
}: {
  onShop: (category?: string) => void;
  onInfo: (topic: InfoTopic) => void;
}) {
  return (
    <footer>
      <div className="footer-top">
        <div className="footer-brand">
          <img src="/images/berrys-logo.png" alt="Berry’s" />
          <p>Little clothes. Lasting memories.</p>
        </div>
        <div>
          <h4>THE LITTLE WARDROBE</h4>
          {["Co-ord sets", "Tops & tees", "Dresses", "Sleepwear"].map((c) => (
            <button key={c} onClick={() => onShop(c)}>
              {c}
            </button>
          ))}
        </div>
        <div>
          <h4>HERE TO HELP</h4>
          {(["Size guide", "Shipping & returns", "Get in touch"] as const).map((t) => (
            <button key={t} onClick={() => onInfo(t)}>
              {t}
            </button>
          ))}
          <Link href="/account">My orders</Link>
          <Link href="/admin">
            Store admin <ArrowUpRight size={12} />
          </Link>
        </div>
        <div className="footer-note">
          <span className="eyebrow">A LITTLE NOTE</span>
          <h3>
            Good things
            <br />
            come in little sizes.
          </h3>
          <p>Discover a wardrobe full of personality.</p>
          <button className="text-link" onClick={() => onShop()}>
            Find their favourite <ArrowRight size={16} />
          </button>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} Berry’s Clothing Brand. All rights reserved.</span>
        <span>Secure payments by Razorpay</span>
        <span>MADE WITH A LITTLE LOVE ♡</span>
      </div>
    </footer>
  );
}
