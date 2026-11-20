import type { Metadata } from "next";

// The tab reads "Teacher console" from the first moment a console page loads,
// not the website's tuition line; each page then sets its own name.
export const metadata: Metadata = {
  title: "Teacher console",
  robots: { index: false, follow: false },
};

export default function AdminGroupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
