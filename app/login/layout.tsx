import type { Metadata } from "next";

/** The student login is a door, not a page to rank. */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
