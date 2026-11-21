import type { Metadata } from "next";
import { preload } from "react-dom";
import { LandingPage } from "@/components/landing/LandingPage";
import { INTRO_SEEN_SCRIPT } from "@/components/landing/IntroLogo";
import { COMPANY_NAME } from "@/lib/config";
import { JsonLd } from "@/components/JsonLd";
import { FAQS, LANDING, posterFor } from "@/lib/landing";
import { coursesLd, faqLd, organizationLd, personLd, websiteLd } from "@/lib/seo";

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

/** The hero video's still, as the hero's VideoPlayer requests it (same URLs, so the browser reuses the download). */
const heroStill = (w: number) => {
  const src = LANDING.heroPoster || posterFor(LANDING.heroVideo) || "";
  return /^https:\/\/i\.ytimg\.com\/vi\//.test(src) ? `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=75` : src;
};

/** Public homepage. Guests land here; the portal lives behind /login. */
export default function Home() {
  // The hero still is the largest thing on a phone's first screen (Google's LCP).
  // Ask for it in the page head, so the browser starts it at once instead of after the scripts.
  if (heroStill(640)) {
    preload(heroStill(1080), {
      as: "image",
      fetchPriority: "high",
      imageSrcSet: `${heroStill(640)} 640w, ${heroStill(1080)} 1080w`,
      imageSizes: "(min-width: 1024px) 720px, 100vw",
    });
  }
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: INTRO_SEEN_SCRIPT }} />
      <JsonLd data={organizationLd()} />
      <JsonLd data={personLd()} />
      <JsonLd data={websiteLd()} />
      <JsonLd data={faqLd(FAQS)} />
      {coursesLd().map((c) => (
        <JsonLd key={c.name} data={c} />
      ))}
      <LandingPage />
    </>
  );
}
