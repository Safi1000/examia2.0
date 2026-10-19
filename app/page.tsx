import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { COMPANY_NAME } from "@/lib/config";
import { JsonLd } from "@/components/JsonLd";
import { FAQS } from "@/lib/landing";
import { coursesLd, faqLd, organizationLd } from "@/lib/seo";

const description =
  "Live online Accounting, Business and Economics classes for Cambridge and Edexcel O Level, IGCSE, AS and A Level. Small groups, weekly tests. Free trial lesson.";
const title = "Accounting, Business & Economics Tuition | Hamza Teaches";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
    siteName: COMPANY_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  alternates: { canonical: "/" },
};

/** Public homepage. Guests land here; the portal lives behind /login. */
export default function Home() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd data={faqLd(FAQS)} />
      {coursesLd().map((c) => (
        <JsonLd key={c.name} data={c} />
      ))}
      <LandingPage />
    </>
  );
}
