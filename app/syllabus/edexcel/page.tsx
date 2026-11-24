import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { FaqList, MarketingShell } from "@/components/landing/MarketingShell";
import "@/components/landing/public-calm.css";
import { Crumbs, Section, Table, TrialBox } from "@/components/study/StudyBits";
import { RelatedLinks } from "@/components/study/RelatedLinks";
import { EDEXCEL, EDEXCEL_CLASSES, IAL_MANUAL, IG_MANUAL } from "@/lib/edexcel";
import { breadcrumbLd, faqLd, fitTitle } from "@/lib/seo";

/** Hub for the Pearson Edexcel guides. Facts live in lib/edexcel.ts, with their sources. */
const title = "Edexcel IGCSE and IAL Accounting, Business, Economics";
const description =
  "Edexcel International GCSE and International A Level Accounting, Business and Economics: codes, papers, marks and exam series for 2026/27, from Pearson.";
const PATH = "/syllabus/edexcel";

export const metadata: Metadata = {
  title: fitTitle(title),
  description,
  alternates: { canonical: PATH },
  openGraph: { title, description, url: PATH, type: "website", images: ["/opengraph-image"] },
};

const FAQ = [
  {
    q: "What are the Edexcel codes for IGCSE Accounting, Business and Economics?",
    a: "International GCSE Accounting is 4AC1, Business is 4BS1 and Economics is 4EC1.",
  },
  {
    q: "What are the Edexcel codes for IAL Accounting, Business and Economics?",
    a: "The full International A Levels are YAC11 (Accounting), YBS11 (Business) and YEC11 (Economics). The AS codes are XAC11, XBS11 and XEC11.",
  },
  {
    q: "When are the Edexcel exams in 2026/2027?",
    a: "Pearson's 2026/2027 manuals list November 2026 and June 2027 for these International GCSEs, and October 2026, January 2027 and June 2027 for the International A Level units.",
  },
  {
    q: "How are Edexcel International GCSEs graded?",
    a: "From 9 to 1, where 9 is the highest grade. International A Levels are graded A* to E, and the AS A to E.",
  },
  { q: "Do you teach Edexcel?", a: EDEXCEL_CLASSES },
];

const SOURCES = [IG_MANUAL, IAL_MANUAL];

const card =
  "pc-surface pc-surface-link flex h-full flex-col rounded-tile px-5 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

export default function EdexcelHub() {
  const groups = (["International GCSE", "International A Level"] as const).map((level) => ({ level, quals: EDEXCEL.filter((q) => q.level === level) }));
  return (
    <MarketingShell>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Syllabus checklists", path: "/syllabus" },
          { name: "Edexcel", path: PATH },
        ])}
      />
      <JsonLd data={faqLd(FAQ)} />
      <div className="public-calm mx-auto max-w-4xl px-5 pb-24 pt-12 md:pt-20">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Syllabus checklists", href: "/syllabus" }, { name: "Edexcel" }]} />
        <h1 className="mt-8 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">Edexcel syllabus guides</h1>

        {groups.map(({ level, quals }) => (
          <Section key={level} title={level}>
            <ul className="grid gap-3 sm:grid-cols-3">
              {quals.map((q) => (
                <li key={q.slug}>
                  <Link href={`/syllabus/edexcel/${q.slug}`} className={card}>
                    <span className="block text-base font-semibold tabular-nums text-foreground">
                      {q.subject} {q.code}
                    </span>
                    <span className="mt-1 block text-sm tabular-nums text-muted-foreground">
                      {q.papers.length} {q.level === "International A Level" ? "units" : "papers"}
                      {q.asCode ? `, AS ${q.asCode}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ))}

        <Section title="Every paper at a glance">
          <Table
            caption="Edexcel papers and units"
            head={["Paper or unit", "Qualification", "Length", "Marks"]}
            rows={EDEXCEL.flatMap((q) => q.papers.map((p) => [p.code, `${q.subject} ${q.code}`, p.length, p.marks]))}
          />
        </Section>

        <TrialBox
          from="edexcel:hub"
          classes
          title="Edexcel student? Start with a free lesson."
          body={`${EDEXCEL_CLASSES} Live small group classes with weekly tests I mark myself.`}
        />

        <Section title="Questions about Edexcel">
          <FaqList items={FAQ} />
        </Section>

        <RelatedLinks
          links={[
            { href: "/syllabus", label: "Cambridge syllabus checklists" },
            { href: "/past-papers", label: "Cambridge past papers with mark schemes" },
            { href: "/online-classes", label: "Online classes" },
          ]}
        />

        <section aria-labelledby="about-edexcel-hub" className="mt-12 border-t border-hairline pt-6">
          <h2 id="about-edexcel-hub" className="text-sm font-semibold text-muted-foreground">About these guides</h2>
          <p className="mt-2 max-w-[64ch] text-sm leading-relaxed text-faint">
            Plain guides to the Pearson Edexcel International GCSE and International A Level (IAL) specifications in Accounting, Business and
            Economics: the qualification codes, how many papers or units each has, their length, marks and weighting, the topics, and the exam
            series Pearson lists for 2026/2027. Each guide names the Pearson documents it was checked against on 24 November 2026.
          </p>
        </section>

        <p className="mt-8 text-sm leading-relaxed text-faint">
          Sources:{" "}
          {SOURCES.map((s, i) => (
            <span key={s.href}>
              {i > 0 && ", "}
              <a href={s.href} className="underline decoration-hairline-strong underline-offset-4 transition-colors duration-200 hover:text-muted-foreground" rel="noopener">
                {s.label}
              </a>
            </span>
          ))}
          , and the specification named on each guide. Pearson Edexcel is a trademark of Pearson Education Limited.
        </p>
      </div>
    </MarketingShell>
  );
}
