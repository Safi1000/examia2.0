import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs } from "@/components/study/StudyBits";
import { PastPapersNav } from "@/components/past-papers/Bits";
import { PAPER_LEVELS, PAST_PAPER_SYLLABI, hasPractice, practiceQuestions } from "@/lib/past-papers";
import { fitTitle } from "@/lib/seo";

const title = "Past Paper MCQ Practice: Accounting and Economics";
const description = "Real Cambridge multiple choice questions, one at a time, marked instantly. O Level, IGCSE and A Level Accounting and Economics. Free, no sign up.";

export const metadata: Metadata = {
  title: fitTitle(title),
  description,
  alternates: { canonical: "/past-papers/practice" },
  openGraph: { title, description, url: "/past-papers/practice", type: "website", images: ["/opengraph-image"] },
};

export default function PracticeHub() {
  const list = PAST_PAPER_SYLLABI.filter((s) => hasPractice(s.code));
  const total = list.reduce((n, s) => n + practiceQuestions(s.code).length, 0);
  return (
    <MarketingShell>
      <div className="mx-auto max-w-4xl px-5 pb-20 pt-10 md:pt-14">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Past papers", href: "/past-papers" }, { name: "Question practice" }]} />
        <PastPapersNav className="mt-6 w-fit max-w-full" />
        <h1 className="mt-8 text-3xl font-bold leading-[1.1] tracking-tight text-foreground md:text-5xl">Question practice</h1>
        <p className="mt-4 max-w-[60ch] text-lg leading-relaxed text-muted-foreground">
          {total.toLocaleString("en-GB")} real multiple choice questions from Cambridge past papers. Pick your subject, do 10 at a time, and see the answer the moment you tap. Questions you get wrong come back until you get them right.
        </p>
        <div className="mt-10 space-y-8">
          {PAPER_LEVELS.map((lvl) => {
            const here = list.filter((s) => s.level === lvl);
            if (!here.length) return null;
            return (
              <section key={lvl} aria-labelledby={`p-${lvl}`}>
                <h2 id={`p-${lvl}`} className="text-xl font-bold text-foreground">
                  {lvl}
                </h2>
                <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                  {here.map((s) => (
                    <li key={s.code}>
                      <Link
                        href={`/past-papers/${s.slug}/practice`}
                        className="group flex items-center gap-4 rounded-[18px] border border-hairline bg-card px-5 py-5 transition-colors hover:border-gold-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-lg font-semibold text-foreground">{s.short}</span>
                          <span className="mt-0.5 block text-[15px] text-muted-foreground">{practiceQuestions(s.code).length} questions</span>
                        </span>
                        <span className="rounded-full bg-gold px-4 py-2 text-[14px] font-semibold text-[#1b1e21] transition-colors group-hover:bg-[#ffd07a]">Start</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
        <p className="mt-10 max-w-[60ch] text-[15px] text-muted-foreground">
          Business papers have no multiple choice section, so they aren&apos;t here. You can still{" "}
          <Link href="/past-papers" className="font-semibold text-gold hover:underline">
            practise any Business paper against the clock
          </Link>{" "}
          and see the grade your mark gets.
        </p>
      </div>
    </MarketingShell>
  );
}
