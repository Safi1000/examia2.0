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
/** Adds the brand to a page title only while the whole title fits Google's ~60 characters. */
export const fitTitle = (t: string) => (t.length + 16 <= 62 ? `${t} | Hamza Teaches` : t);

export const PUBLIC_ROUTES: Array<{ path: string; priority: number }> = [
  { path: "/", priority: 1 },
  // /guides is hidden until the PDF pack launches (noindex on the page).
  { path: "/blog", priority: 0.7 },
  { path: "/tools/grade-predictor", priority: 0.6 },
  { path: "/tools", priority: 0.6 },
  { path: "/tools/ratio-calculator", priority: 0.6 },
  { path: "/tools/break-even-calculator", priority: 0.6 },
  { path: "/tools/elasticity-calculator", priority: 0.6 },
  { path: "/tools/depreciation-calculator", priority: 0.6 },
  { path: "/tools/investment-appraisal-calculator", priority: 0.6 },
  // Study pages: indexed and in the sitemap, but kept off the landing page.
  { path: "/grade-thresholds", priority: 0.7 },
  { path: "/private-candidates/pakistan", priority: 0.6 },
  { path: "/private-candidates/uae", priority: 0.6 },
  { path: "/private-candidates/saudi-arabia", priority: 0.6 },
  { path: "/online-classes", priority: 0.6 },
  { path: "/online-classes/gulf", priority: 0.6 },
  { path: "/privacy", priority: 0.2 },
  { path: "/terms", priority: 0.2 },
];

const ORG_ID = `${SITE_URL}/#organization`;
export const PERSON_ID = `${SITE_URL}/#hamza`;

/** Every profile that is Hamza / Hamza Teaches. Search engines use these to join them into one entity. */
export const SAME_AS = [LANDING.instagram, LANDING.youtube];

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
    sameAs: SAME_AS,
    email: LANDING.email,
    founder: { "@id": PERSON_ID },
    logo: absolute("/apple-icon"),
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

/** Hamza as a person: the teacher behind the brand (articles point their author here). */
export function personLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": PERSON_ID,
    // Use this exact spelling on every profile (Instagram, YouTube, LinkedIn, Google).
    name: "Hamza Sadaqat",
    givenName: "Hamza",
    familyName: "Sadaqat",
    alternateName: "Hamza Teaches",
    url: SITE_URL,
    image: absolute("/hamza.jpg"),
    jobTitle: "Accounting, Business and Economics tutor",
    worksFor: { "@id": ORG_ID },
    sameAs: SAME_AS,
    knowsAbout: ["Accounting", "Business Studies", "Economics", "Cambridge O Level", "Cambridge IGCSE", "Cambridge International AS & A Level"],
  };
}

export function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: COMPANY_NAME,
    url: SITE_URL,
    publisher: { "@id": ORG_ID },
    inLanguage: "en",
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
