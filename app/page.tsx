import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { COMPANY_NAME } from "@/lib/config";

const description =
  "Watch a full lesson at your level, free. Accounting, Business and Economics for O Level, IGCSE, AS and A2. Taught by an ACCA Affiliate.";

export const metadata: Metadata = {
  title: `${COMPANY_NAME} | Accounting, Business and Economics Tuition`,
  description,
  openGraph: {
    title: `${COMPANY_NAME} | Accounting, Business and Economics Tuition`,
    description,
    type: "website",
    siteName: COMPANY_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: `${COMPANY_NAME} | Accounting, Business and Economics Tuition`,
    description,
  },
  alternates: { canonical: "/" },
};

/** Public homepage. Guests land here; the portal lives behind /login. */
export default function Home() {
  return <LandingPage />;
}
