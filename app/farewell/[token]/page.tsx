import type { Metadata } from "next";
import { FarewellPublic } from "@/components/student/FarewellScreen";

/**
 * The link Hamza sends a student who has left: a thank-you and a small
 * feedback card (see app/api/farewell). Private: never indexed, not in the
 * sitemap.
 */
export const metadata: Metadata = {
  title: "Thank you · Hamza Teaches",
  robots: { index: false, follow: false },
};

export default async function FarewellPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <FarewellPublic token={token.slice(0, 120)} />;
}
