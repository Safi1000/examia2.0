import type { Metadata, Viewport } from "next";
import { TeachGate } from "@/components/board/TeachGate";

/**
 * Hamza's live whiteboard inside the portal: /teach/board on the tablet (draw),
 * /teach/present on the laptop (screen-share in Meet; follows the tablet).
 * Full screen, no sidebar, and outside the console's 30-minute auto sign-out
 * so a long class never logs out. Teacher sign-in only.
 */
export const metadata: Metadata = {
  title: "Whiteboard · Hamza Teaches",
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

export default function TeachLayout({ children }: { children: React.ReactNode }) {
  return <TeachGate>{children}</TeachGate>;
}
