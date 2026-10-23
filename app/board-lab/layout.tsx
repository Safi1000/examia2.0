import type { Metadata, Viewport } from "next";

/**
 * The students' watch-only board link (/board-lab/view). Not indexed.
 * /board-lab itself now forwards to the teacher console.
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
