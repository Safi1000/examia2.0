import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell, FaqList } from "@/components/landing/MarketingShell";
import { Crumbs, Section } from "@/components/study/StudyBits";
import { SESSIONS } from "@/lib/grade-thresholds";
import { breadcrumbLd, faqLd, fitTitle } from "@/lib/seo";
import { THRESHOLD_PAGES, gradeShown, gradesOf, pct, sessionsOf, spread } from "@/lib/threshold-pages";

const title = "Cambridge Grade Thresholds: O Level, IGCSE, A Level";
const description =
  "Official Cambridge grade thresholds for O Level, IGCSE and A Level Accounting, Business and Economics, June 2024 to June 2026, with 2027 targets.";

export const metadata: Metadata = {
  title: fitTitle(title),
  description,
  alternates: { canonical: "/grade-thresholds" },
  openGraph: { title, description, url: "/grade-thresholds", type: "website", images: ["/opengraph-image"] },
  twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
};

const FAQ = [
  {
    q: "What is a grade threshold?",
    a: "The lowest total mark that earned each grade in one exam session. Cambridge sets them after the papers are marked, so they change every session and every variant.",
  },
  {
    q: "Is an A always 80%?",
    a: "No. In June 2026 the minimum for an A in IGCSE Accounting 0452 ranged from 80 to 88 out of 143 depending on the variant, which is 56% to 62%. Each syllabus page shows the real numbers.",
  },
  {
    q: "Which variant did I sit?",
    a: "The second digit of your paper code. Paper 12 or 22 means variant 2. Schools in the same region usually sit the same variant.",
  },
  {
    q: "Where do these numbers come from?",
    a: "Cambridge International's own grade threshold tables. Every session on every page links to the official PDF.",
  },
];

export default function GradeThresholdsHub() {
  const groups = ["O Level", "IGCSE", "AS and A Level"].map((level) => ({ level, pages: THRESHOLD_PAGES.filter((p) => p.level === level) }));
  return (
    <MarketingShell>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Grade thresholds", path: "/grade-thresholds" }])} />
      <JsonLd data={faqLd(FAQ)} />
      <div className="mx-auto max-w-4xl px-5 pb-20 pt-14 md:pt-20">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Grade thresholds" }]} />
        <h1 className="mt-8 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">
          Cambridge grade thresholds for Accounting, Business and Economics
        </h1>
        <p className="mt-5 max-w-[64ch] text-lg leading-relaxed text-muted-foreground">
          The minimum marks for every grade, {SESSIONS.join(", ")}, for every paper variant, straight from Cambridge&apos;s published
          tables. Each page also shows the total that would have been enough on every recent paper, and a calculator for your own marks.
        </p>

        {groups.map((gr) => (
          <Section key={gr.level} title={gr.level}>
            <ul className="surface grid divide-y divide-hairline overflow-hidden rounded-[20px] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {gr.pages.map((p) => {
                const s = p.syllabuses[p.syllabuses.length - 1];
                const latest = sessionsOf(s)[0];
                const top = gradesOf(s)[0];
                const sp = spread(s, latest, top);
                return (
                  <li key={p.slug}>
                    <Link
                      href={`/grade-thresholds/${p.slug}`}
                      className="row-link group flex h-full min-h-16 items-center gap-4 px-5 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold sm:items-start sm:py-5"
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[17px] font-semibold text-foreground transition-colors group-hover:text-gold">
                        {p.subject} <span className="tabular-nums">{p.code}</span>
                        {p.code === "0450" ? " (now 0264)" : p.code === "7115" ? " (now 7081)" : ""}
                      </span>
                      {sp && (
                        <span className="mt-1 text-[14px] tabular-nums text-muted-foreground">
                          {gradeShown(s.qualification, top)} in {latest}: {pct(sp.low.min, sp.low.max)}%
                          {sp.low.min !== sp.high.min ? ` to ${pct(sp.high.min, sp.high.max)}%` : ""}
                        </span>
                      )}
                      </span>
                      <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-gold sm:hidden" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m8 5 5 5-5 5" />
                      </svg>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Section>
        ))}

        <Section title="Have your marks already?">
          <Link href="/tools/grade-predictor" className="inline-flex min-h-11 items-center text-lg font-semibold text-gold underline-offset-4 hover:underline">
            Try the free grade predictor
          </Link>
        </Section>

        <Section title="Questions students ask">
          <FaqList items={FAQ} />
        </Section>
      </div>
    </MarketingShell>
  );
}
