import type { Metadata, Viewport } from "next";
import { DM_Sans, Manrope } from "next/font/google";
import { headers } from "next/headers";
import { getSettings } from "@/lib/settings";
import "./globals.css";
import "./shop.css";

// Self-hosted at build time: no runtime request to Google, no layout shift.
const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Manrope({ subsets: ["latin"], variable: "--font-display", display: "swap" });

/** Site-wide SEO from Dashboard → Settings (pages can still set their own title). */
export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  const image = s.seoImage || "/images/berrys-logo-full.webp";
  return {
    metadataBase: new URL(
      process.env.SITE_URL ||
        (process.env.VERCEL_PROJECT_PRODUCTION_URL &&
          `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
        "http://localhost:3000",
    ),
    title: s.seoTitle || s.siteName,
    description: s.seoDescription,
    keywords: s.seoKeywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
    applicationName: s.siteName,
    icons: { icon: "/favicon.png", apple: "/apple-touch-icon.png" },
    openGraph: {
      title: s.seoTitle || s.siteName,
      description: s.seoDescription,
      siteName: s.siteName,
      images: [image],
      type: "website",
      locale: "en_IN",
    },
    twitter: { card: "summary_large_image", title: s.seoTitle || s.siteName, description: s.seoDescription },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#183147",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request makes every page render per request, so Next.js can
  // stamp its scripts with the CSP nonce set in proxy.ts.
  await headers();
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
