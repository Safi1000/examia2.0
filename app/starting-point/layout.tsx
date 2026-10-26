import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";

/** The Blueprint's own look for the Starting Point Check: its fonts, no site menu. */
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "700", "800"], variable: "--font-bricolage", display: "swap" });
const instrument = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-instrument", display: "swap" });

export const metadata: Metadata = {
  title: "The Blueprint: Starting Point Check",
  description: "A short check so your classes start exactly where you are.",
  // Shared directly with students; kept out of search results.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2A3439" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1416" },
  ],
};

export default function StartingPointLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${bricolage.variable} ${instrument.variable}`}>{children}</div>;
}
