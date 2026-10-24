import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs, Section, TrialBox } from "@/components/study/StudyBits";
import { MCQ_SYLLABUSES, liveSyllabuses, papersFor, syllabusName } from "@/lib/mcq-papers";
import { breadcrumbLd } from "@/lib/seo";

/**
 * The past paper multiple-choice checker: one entry per Cambridge MCQ paper
 * Hamza teaches. A syllabus only links through once it has a paper in
 * lib/mcq-papers.ts, and the page stays out of search until one does.
 */
const title = "Past Paper MCQ Checker: Accounting and Economics Paper 1";
const description =
  "Do a real Cambridge Paper 1 past paper under exam timing, shade your answers, and get it marked instantly, with a topic breakdown. IGCSE, O Level, AS and A Level.";

export const metadata: Metadata = {
  title: `${title} | Hamza Teaches`,
  description,
  alternates: { canonical: "/tools/past-paper-mcq" },
  robots: liveSyllabuses().length ? undefined : { index: false },
  openGraph: { title, description, url: "/tools/past-paper-mcq", type: "website", images: ["/opengraph-image"] },
  twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
};

export default function PastPaperMcqHub() {
  const subjects = ["Accounting", "Economics"] as const;
  return (
    <MarketingShell>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Past paper MCQ checker", path: "/tools/past-paper-mcq" }])} />
      <div className="mx-auto max-w-3xl px-5 pb-20 pt-14 md:pt-20">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Past paper MCQ checker" }]} />
        <h1 className="mt-8 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">
          Do a real Paper 1. Get it marked in a second.
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          Multiple-choice papers are the easiest to practise and the most boring to mark. Do a real Cambridge past paper under exam timing,
          shade your answers here, and see your score, the questions you got wrong, and which topics they came from.
        </p>

        <Section title="How it works">
          <ol className="list-decimal space-y-3 pl-5 text-[17px] leading-relaxed text-body">
            <li>Choose your syllabus and a paper. Each one links to the official question paper on the Cambridge website.</li>
            <li>Start the timer if you want exam conditions. It runs for the same time as the real paper.</li>
            <li>Shade your answers on the answer sheet, then mark it. Your answers are saved on your device as you go.</li>
            <li>Or practise one topic at a time: the checker takes you through real past paper questions on that topic, one by one, and opens the official paper at each question.</li>
          </ol>
          <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">
            The questions belong to Cambridge, so they are never copied here. You work from the official paper, and the answers come from
            the official mark scheme.
          </p>
        </Section>

        {subjects.map((subject) => (
          <Section key={subject} title={subject}>
            <ul className="space-y-3">
              {MCQ_SYLLABUSES.filter((s) => s.subject === subject).map((s) => {
                const count = papersFor(s.slug).length;
                const label = `${syllabusName(s)}, Paper ${s.paper}`;
                return (
                  <li key={s.slug}>
                    {count ? (
                      <Link
                        href={`/tools/past-paper-mcq/${s.slug}`}
                        className="flex items-center justify-between gap-4 rounded-[16px] border border-hairline bg-card px-5 py-4 text-foreground hover:border-gold-border"
                      >
                        <span>{label}</span>
                        <span className="text-sm text-muted-foreground">
                          {count} {count === 1 ? "paper" : "papers"}
                        </span>
                      </Link>
                    ) : (
                      <div className="flex items-center justify-between gap-4 rounded-[16px] border border-hairline px-5 py-4 text-muted-foreground">
                        <span>{label}</span>
                        <span className="text-sm text-faint">Papers coming</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        ))}

        <p className="mt-8 text-[15px] leading-relaxed text-muted-foreground">
          Business has no multiple-choice paper. For A Level Accounting, the multiple-choice paper is the AS Paper 1.
        </p>

        <TrialBox
          from="tools:past-paper-mcq"
          title="Know your score. Fix the gaps."
          body="If the same topics keep costing you marks, bring your marked papers to a free trial lesson and we will work through them together."
        />
      </div>
    </MarketingShell>
  );
}
