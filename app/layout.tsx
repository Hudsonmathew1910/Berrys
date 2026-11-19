import type { Metadata, Viewport } from "next";
import { DM_Sans, Manrope } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import "./shop.css";

// Self-hosted at build time: no runtime request to Google, no layout shift.
const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Manrope({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.SITE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
      "http://localhost:3000",
  ),
  title: "Berry’s — Made for little adventures",
  description:
    "Thoughtfully chosen clothing for everyday adventures. Discover comfortable co-ords, playful essentials and little favourites at Berry’s.",
  icons: { icon: "/favicon.png", apple: "/apple-touch-icon.png" },
  openGraph: {
    title: "Berry’s — Made for little adventures",
    description: "Comfortable co-ords, playful essentials and little favourites for kids.",
    images: ["/images/berrys-logo-full.webp"],
  },
  formatDetection: { telephone: false },
};

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
