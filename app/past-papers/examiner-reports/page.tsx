import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs, Section, TrialBox } from "@/components/study/StudyBits";
import { PAST_PAPER_SYLLABI, PAPER_LEVELS } from "@/lib/past-papers";
import { breadcrumbLd, faqLd } from "@/lib/seo";
import { EXAMINER_REPORTS_HUB, reportHref, reportSeriesLabel, reportsFor } from "@/lib/examiner-reports";

const title = "Cambridge Examiner Reports: Common Mistakes by Syllabus";
const description =
  "Cambridge examiner reports for Accounting, Business and Economics at O Level, IGCSE and A Level: the common mistakes on each paper and what to do instead.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: EXAMINER_REPORTS_HUB },
  openGraph: { title, description, url: EXAMINER_REPORTS_HUB, type: "website", images: ["/opengraph-image"] },
};

const faq = [
  {
    q: "What is a Cambridge examiner report?",
    a: "After each exam series, the examiners write up how candidates answered every paper: what earned marks and where marks were lost. Each page here is my plain summary of one report, paper by paper and question by question.",
  },
  {
    q: "Business Studies 0450 and 7115 now have new codes. Are these still useful?",
    a: "Yes. From 2027 IGCSE Business Studies is 0264 and O Level Business Studies is 7081. The first exams on the new codes are in 2027, so the 0450 and 7115 reports are the closest guide you have to what the examiners reward.",
  },
  {
    q: "When should I read one?",
    a: "Right after you have sat and marked the paper from that series. Then the examiners' points land on the exact questions where you lost marks.",
  },
];

export default function ExaminerReportsHub() {
  const groups = PAPER_LEVELS.map((level) => ({
    level,
    syllabi: PAST_PAPER_SYLLABI.filter((s) => s.level === level && reportsFor(s.code).length > 0),
  })).filter((g) => g.syllabi.length);

  return (
    <MarketingShell>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Past papers", path: "/past-papers" },
          { name: "Examiner reports", path: EXAMINER_REPORTS_HUB },
        ])}
      />
      <JsonLd data={faqLd(faq)} />
      <div className="mx-auto max-w-4xl px-5 pb-20 pt-8 md:pt-12">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Past papers", href: "/past-papers" }, { name: "Examiner reports" }]} />
        <h1 className="mt-4 text-4xl font-bold leading-[1.06] tracking-tight text-foreground md:text-5xl">Cambridge examiner reports</h1>

        {groups.map((g) => (
          <Section key={g.level} title={g.level}>
            <div className="grid gap-10 md:grid-cols-2">
              {g.syllabi.map((s) => (
                <div key={s.code}>
                  <h3 className="text-lg font-semibold text-foreground">
                    {s.name}
                    {s.next && <span className="block text-sm font-normal text-faint">{s.next.code} from {s.next.from}</span>}
                  </h3>
                  <ul className="mt-3 divide-y divide-hairline border-y border-hairline">
                    {reportsFor(s.code).map((r) => (
                      <li key={r.series}>
                        <Link href={reportHref(r)} className="flex min-h-12 items-center py-2.5 text-base font-semibold text-foreground underline-offset-4 hover:underline">
                          {reportSeriesLabel(r.series)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link href={`/past-papers/${s.slug}`} className="mt-3 inline-flex min-h-11 items-center text-sm text-muted-foreground underline decoration-hairline-strong underline-offset-4 hover:text-foreground">
                    {s.short} past papers
                  </Link>
                </div>
              ))}
            </div>
          </Section>
        ))}

        <TrialBox
          from="examiner-reports"
          classes
          title="Want these mistakes gone before your exam?"
          body="That is what I fix in class: the exact questions students keep dropping marks on, with the mark scheme open. Start with one free lesson."
        />

        <section aria-labelledby="about-er" className="mt-12 border-t border-hairline pt-6">
          <h2 id="about-er" className="text-sm font-semibold text-muted-foreground">
            About these pages
          </h2>
          <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-faint">
            Summaries of the most recent Cambridge examiner reports for O Level, IGCSE and AS and A Level Accounting, Business and Economics, written in my own words. Each one
            goes through every paper the report covers: what candidates did well, the most common mistakes and what to do instead, with links to the matching past papers on this site.
          </p>
        </section>

        <Section title="Questions students ask">
          <dl className="space-y-6">
            {faq.map((f) => (
              <div key={f.q}>
                <dt className="font-semibold text-foreground">{f.q}</dt>
                <dd className="mt-1.5 text-lg leading-relaxed text-muted-foreground">{f.a}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <p className="mt-12 text-sm text-faint">
          Examiner reports are © Cambridge University Press &amp; Assessment. These pages are independent summaries for revision.
        </p>
      </div>
    </MarketingShell>
  );
}
