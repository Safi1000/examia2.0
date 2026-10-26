import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Starting Point Check | Hamza Teaches",
  description: "A short check so your classes start exactly where you are.",
  // Shared directly with students; kept out of search results.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#212427",
};

export default function StartingPointLayout({ children }: { children: React.ReactNode }) {
  return children;
}
