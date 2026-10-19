/**
 * Search-engine seam: the canonical site URL, the public routes for the
 * sitemap, and schema.org structured data builders. Server-safe (no window).
 */
import { COMPANY_NAME } from "@/lib/config";
import { LANDING } from "@/lib/landing";
import { SUBJECT_PAGES } from "@/lib/subjects";

/** No trailing slash. The live site serves on www (hamzateaches.com redirects there). Override per deploy. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.hamzateaches.com").replace(
  /\/$/,
  "",
);

export const absolute = (path: string) => `${SITE_URL}${path === "/" ? "" : path}`;

/** Every indexable page. Keep in sync with isPublicPath in lib/public-paths.ts. */
export const PUBLIC_ROUTES: Array<{ path: string; priority: number }> = [
  { path: "/", priority: 1 },
  // /guides is hidden until the PDF pack launches (noindex on the page).
  { path: "/blog", priority: 0.7 },
  { path: "/tools/grade-predictor", priority: 0.6 },
  { path: "/privacy", priority: 0.2 },
  { path: "/terms", priority: 0.2 },
];

const ORG_ID = `${SITE_URL}/#organization`;

export function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    "@id": ORG_ID,
    name: COMPANY_NAME,
    url: SITE_URL,
    description:
      "Live online small-group tuition in Accounting, Business and Economics for Cambridge and Pearson Edexcel O Level, IGCSE, AS and A Level.",
    address: { "@type": "PostalAddress", addressLocality: "Rawalpindi", addressCountry: "PK" },
    sameAs: [LANDING.instagram],
    email: LANDING.email,
    knowsAbout: [
      "Accounting",
      "Business Studies",
      "Economics",
      "Cambridge O Level",
      "Cambridge IGCSE",
      "Cambridge International AS & A Level",
      "Pearson Edexcel International GCSE",
      "Pearson Edexcel International A Level",
    ],
  };
}

export function faqLd(items: Array<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function breadcrumbLd(trail: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: absolute(t.path),
    })),
  };
}

/** One Course per subject and level, printed on the homepage. */
export function coursesLd() {
  return SUBJECT_PAGES.flatMap((s) =>
    s.levels.map((l) => ({
      "@context": "https://schema.org",
      "@type": "Course",
      name: `${s.subject} tuition: ${l.level}`,
      description: `${l.title}. ${l.body} Cambridge and Pearson Edexcel.`,
      courseCode: l.codes,
      url: absolute("/"),
      provider: { "@id": ORG_ID, "@type": "EducationalOrganization", name: COMPANY_NAME },
      inLanguage: "en",
      hasCourseInstance: [{ "@type": "CourseInstance", courseMode: "online" }],
      offers: { "@type": "Offer", category: "Free trial lesson", price: "0", priceCurrency: "PKR" },
    })),
  );
}

export function toolLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Grade predictor",
    url: absolute("/tools/grade-predictor"),
    applicationCategory: "EducationalApplication",
    operatingSystem: "Any",
    isAccessibleForFree: true,
    provider: { "@id": ORG_ID },
  };
}
