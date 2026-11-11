import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell, FaqList } from "@/components/landing/MarketingShell";
import { Section, TrialBox } from "@/components/study/StudyBits";
import { PastPapersNav } from "@/components/past-papers/Bits";
import { RelatedLinks } from "@/components/study/RelatedLinks";
import { PaperSearch } from "@/components/past-papers/PaperSearch";
import { ContinueStrip } from "@/components/past-papers/ContinueStrip";
import { YEAR_RANGE, PAPER_LEVELS, PAST_PAPER_SYLLABI, changeNote } from "@/lib/past-papers";
import { breadcrumbLd, faqLd, fitTitle } from "@/lib/seo";

const title = `Past Papers ${YEAR_RANGE}: O Level, IGCSE and A Level`;
const description =
  `Every O Level, IGCSE and A Level Accounting, Business and Economics past paper from ${YEAR_RANGE} with mark schemes. Read them here, practise timed, get multiple choice marked instantly.`;

export const metadata: Metadata = {
  title: fitTitle(`Past Papers ${YEAR_RANGE} with Mark Schemes`),
  description,
  alternates: { canonical: "/past-papers" },
  openGraph: { title, description, url: "/past-papers", type: "website", images: ["/opengraph-image"] },
};

const SUBJECTS = ["Accounting", "Economics", "Business"] as const;

export default function PastPapersHub() {
  const faq = [
    {
      q: "Are these the real Cambridge papers?",
      a: `Yes. Original Cambridge files, ${YEAR_RANGE}: question papers, mark schemes, inserts, examiner reports and grade thresholds. Nothing retyped, nothing missing.`,
    },
    {
      q: "How do I find one paper fast?",
      a: "Type the code on its front page, like 2281/12/M/J/25. Or type it the way you'd say it: economics june 2024 paper 2. Both work.",
    },
    {
      q: "Which papers mark themselves?",
      a: "Every multiple choice paper. Tap your answers, press Mark it, and you get your score, your grade on that paper and every question you missed. Written papers you mark with the mark scheme. That part is on you, and it's where the learning happens.",
    },
    {
      q: "Is it actually free?",
      a: "Yes. No ads, no sign up, and no premium button waiting at the end. Your progress stays on your own phone. I'd rather you spend your time on papers than on pop-ups.",
    },
    {
      q: "My syllabus changed in 2027. Are these still worth doing?",
      a: "Yes. Business moved to new codes (0450 is now 0264, 7115 is now 7081). Accounting and Economics kept their codes with refreshed content. The ideas these papers test haven't gone anywhere, and where a topic is brand new in 2027, the topical pages say so.",
    },
  ];
  return (
    <MarketingShell>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Past papers", path: "/past-papers" }])} />
      <JsonLd data={faqLd(faq)} />
      <div className="mx-auto max-w-5xl px-5 pb-20 pt-10 md:pt-16">
        <header className="mx-auto max-w-2xl text-center">
          <h1 className="text-5xl font-bold tracking-tight text-foreground md:text-7xl">Past papers</h1>
          <PaperSearch quiet className="mt-10 text-left" />
          <PastPapersNav className="mx-auto mt-5 w-fit max-w-full" />
        </header>

        <ContinueStrip />

        <section aria-labelledby="pick-h" className="mt-14">
          <h2 id="pick-h" className="sr-only">
            Syllabuses
          </h2>
          <div className="mt-5 overflow-hidden rounded-[24px] border border-hairline bg-card">
            <div className="hidden grid-cols-[180px_repeat(3,minmax(0,1fr))] border-b border-hairline md:grid">
              <span />
              {SUBJECTS.map((sub) => (
                <span key={sub} className="px-6 py-4 text-[15px] font-semibold text-muted-foreground">
                  {sub}
                </span>
              ))}
            </div>
            {PAPER_LEVELS.map((lvl, i) => (
              <div key={lvl} className={`grid md:grid-cols-[180px_repeat(3,minmax(0,1fr))] ${i ? "border-t border-hairline" : ""}`}>
                <p className="px-5 pb-1 pt-5 text-[17px] font-bold text-foreground md:flex md:items-center md:px-6 md:py-6">{lvl === "AS and A Level" ? "AS and A Level" : lvl}</p>
                <ul className="grid grid-cols-3 gap-2 px-5 pb-5 pt-2 md:contents">
                  {SUBJECTS.map((sub) => {
                    const s = PAST_PAPER_SYLLABI.find((x) => x.level === lvl && x.subject === sub);
                    if (!s) return <li key={sub} />;
                    return (
                      <li key={sub} className="md:border-l md:border-hairline">
                        <Link
                          href={`/past-papers/${s.slug}`}
                          className="group flex h-full flex-col justify-center rounded-[14px] border border-hairline px-3 py-3 transition-colors hover:border-gold-border hover:bg-gold-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold md:rounded-none md:border-0 md:px-6 md:py-6"
                        >
                          <span className="text-[13px] text-muted-foreground md:hidden">{sub}</span>
                          <span className="text-xl font-bold tabular-nums text-foreground group-hover:text-gold md:text-2xl">{s.code}</span>
                          {changeNote(s) && <span className="mt-0.5 text-[13px] text-faint md:text-[14px]">{changeNote(s)}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <TrialBox
          from="past-papers"
          title="Papers find the gaps. Classes close them."
          body="Every paper tells you where the marks go missing. In class, that's exactly what we fix. One free lesson to see if it clicks."
        />

        <Section title="Questions students ask">
          <FaqList items={faq} />
        </Section>

        <RelatedLinks
          links={[
            { href: "/syllabus", label: "Cambridge syllabus checklists" },
            { href: "/grade-thresholds", label: "Cambridge grade thresholds" },
            { href: "/tools/grade-predictor", label: "Grade predictor" },
            { href: "/blog", label: "The Exam Room: exam technique and topic guides" },
          ]}
        />

        <p className="mt-12 text-sm text-faint">Papers, mark schemes and reports are © Cambridge University Press &amp; Assessment, shared here for students&apos; revision.</p>
      </div>
    </MarketingShell>
  );
}
