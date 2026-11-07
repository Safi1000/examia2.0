import type { Metadata, Viewport } from "next";
import {
  Caveat,
  Inter_Tight,
  Spline_Sans_Mono,
} from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { MetaPixel } from "@/components/MetaPixel";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { COMPANY_NAME, GSC_VERIFICATION } from "@/lib/config";
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
  preload: false, // only the Groundwork timer uses it
});

const splineMono = Spline_Sans_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-spline-mono",
  display: "swap",
  preload: false, // only timers and results use it
});

export const metadata: Metadata = {
  // Resolves relative share-image and canonical URLs to the live domain.
  metadataBase: new URL(SITE_URL),
  title: `${COMPANY_NAME} · O Level, IGCSE and A Level tuition`,
  description: "Online O Level, IGCSE and A Level tuition in Accounting, Business and Economics, with free past papers. Book a free trial lesson.",
  // Tab and home-screen icons come from app/icon.svg and app/apple-icon.tsx.
  ...(GSC_VERIFICATION ? { verification: { google: GSC_VERIFICATION } } : {}),
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
      // The homepage's pre-paint script adds "intro-seen" to <html> on repeat visits
      // (components/landing/IntroLogo.tsx), so its class can differ from the server's.
      suppressHydrationWarning
    >
      <body className="min-h-dvh antialiased">
        {/* Outside Providers on purpose: that gate renders a splash until
            hydration, which kept the pixel out of the server HTML entirely. */}
        <MetaPixel />
        <GoogleAnalytics />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
