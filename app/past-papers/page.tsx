import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell, FaqList } from "@/components/landing/MarketingShell";
import { Section, TrialBox } from "@/components/study/StudyBits";
import { PastPapersNav } from "@/components/past-papers/Bits";
import { PaperSearch } from "@/components/past-papers/PaperSearch";
import { ContinueStrip } from "@/components/past-papers/ContinueStrip";
import { YEAR_RANGE, PAPER_LEVELS, PAST_PAPER_SYLLABI, papersFor } from "@/lib/past-papers";
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
  const instant = PAST_PAPER_SYLLABI.reduce((n, s) => n + papersFor(s.code).filter((p) => p.mcq).length, 0);
  const faq = [
    {
      q: "Are these the real Cambridge papers?",
      a: `Yes. Every question paper, mark scheme, insert, examiner report and grade threshold table here is the original Cambridge file, from ${YEAR_RANGE}.`,
    },
    {
      q: "How do I find a paper quickly?",
      a: "Type the code printed on the front of the paper into the search box, like 2281/12/M/J/25, or just a subject and year. You can also pick your subject below and filter by paper, year and series.",
    },
    {
      q: "Which papers are marked automatically?",
      a: `All the multiple choice papers, ${instant} of them. Tap your answers on screen and you get your score, the grade it gets on that paper, and every question you got wrong with the right answer.`,
    },
    {
      q: "Is it free?",
      a: "Yes. No sign up, no ads. Your progress is saved on your own phone or laptop.",
    },
  ];
  return (
    <MarketingShell>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Past papers", path: "/past-papers" }])} />
      <JsonLd data={faqLd(faq)} />
      <div className="mx-auto max-w-5xl px-5 pb-20 pt-10 md:pt-16">
        <header className="mx-auto max-w-2xl text-center">
          <h1 className="text-5xl font-bold tracking-tight text-foreground md:text-7xl">Past papers</h1>
          <p className="mx-auto mt-4 max-w-[46ch] text-lg leading-relaxed text-muted-foreground">
            Every Cambridge paper from {YEAR_RANGE} with its mark scheme. Read, practise, see your grade.
          </p>
          <PaperSearch quiet className="mt-8 text-left" />
          <PastPapersNav className="mx-auto mt-5 w-fit max-w-full" />
        </header>

        <ContinueStrip />

        <section aria-labelledby="pick-h" className="mt-16">
          <h2 id="pick-h" className="text-[13px] font-semibold uppercase tracking-[0.22em] text-faint">
            Choose your syllabus
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
                          {s.next && <span className="mt-0.5 text-[13px] text-faint md:text-[14px]">and {s.next.code} from {s.next.from}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href="/past-papers/practice" className="group flex items-center justify-between gap-4 rounded-[20px] border border-hairline bg-card px-6 py-5 transition-colors hover:border-gold-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
            <span>
              <span className="block text-[17px] font-semibold text-foreground">Question practice</span>
              <span className="mt-0.5 block text-[15px] text-muted-foreground">Real MCQs, marked as you tap</span>
            </span>
            <span aria-hidden className="text-xl text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-gold">→</span>
          </Link>
          <Link href="/past-papers/progress" className="group flex items-center justify-between gap-4 rounded-[20px] border border-hairline bg-card px-6 py-5 transition-colors hover:border-gold-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
            <span>
              <span className="block text-[17px] font-semibold text-foreground">My progress</span>
              <span className="mt-0.5 block text-[15px] text-muted-foreground">Scores, grades and your mistakes list</span>
            </span>
            <span aria-hidden className="text-xl text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-gold">→</span>
          </Link>
        </div>

        <TrialBox
          from="past-papers"
          title="Past papers show you the gaps. Classes close them."
          body="Doing papers tells you what you keep losing marks on. In my classes we fix exactly that, every week, with the mark scheme open. Start with one free lesson."
        />

        <Section title="Questions students ask">
          <FaqList items={faq} />
        </Section>

        <p className="mt-12 text-sm text-faint">Papers, mark schemes and reports are © Cambridge University Press &amp; Assessment, shared here for students&apos; revision.</p>
      </div>
    </MarketingShell>
  );
}
