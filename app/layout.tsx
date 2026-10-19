import type { Metadata, Viewport } from "next";
import {
  Caveat,
  Inter_Tight,
  Spline_Sans_Mono,
} from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { MetaPixel } from "@/components/MetaPixel";
import { COMPANY_NAME } from "@/lib/config";
import { SITE_URL } from "@/lib/seo";

// The one brand typeface: public site and portal.
const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter-tight",
  display: "swap",
});

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-caveat",
  display: "swap",
});

const splineMono = Spline_Sans_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-spline-mono",
  display: "swap",
});

export const metadata: Metadata = {
  // Resolves relative share-image and canonical URLs to the live domain.
  metadataBase: new URL(SITE_URL),
  title: `${COMPANY_NAME} — Exam & Cohort Portal`,
  description: "A calm, mobile-first exam and cohort-management portal.",
  // Tab and home-screen icons come from app/icon.svg and app/apple-icon.tsx.
};

export const viewport: Viewport = {
  themeColor: "#1a1d20",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${splineMono.variable} ${caveat.variable} ${interTight.variable} h-full`}
    >
      <body className="min-h-dvh antialiased">
        {/* Outside Providers on purpose: that gate renders a splash until
            hydration, which kept the pixel out of the server HTML entirely. */}
        <MetaPixel />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
