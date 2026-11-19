import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "Berry’s — Made for little adventures",
  description:
    "Thoughtfully chosen clothing for everyday adventures. Discover comfortable co-ords, playful essentials and little favourites at Berry’s.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Berry’s — Made for little adventures",
    description: "Comfortable co-ords, playful essentials and little favourites for kids.",
    images: ["/images/berrys-logo.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
