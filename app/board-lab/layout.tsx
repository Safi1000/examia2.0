import type { Metadata, Viewport } from "next";

/**
 * Hidden test area for the live whiteboard. Not linked anywhere, not indexed.
 * Remove this folder (and components/board) to take it away completely.
 */
export const metadata: Metadata = {
  title: "Board · Hamza Teaches",
  robots: { index: false, follow: false },
};

// The board handles its own pinch-zoom; stop the browser zooming the page.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#141618",
};

export default function BoardLabLayout({ children }: { children: React.ReactNode }) {
  return children;
}
